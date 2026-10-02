import crypto from "node:crypto";
import { admin, audit, verifyPassword, findOperator } from "./operator.server";

function getBackupKey(): Buffer {
  const secret =
    process.env["MENELOG_BACKUP_ENCRYPTION_KEY"] || process.env["TENANT_BACKUP_SECRET"];
  if (!secret) throw new Error("Backup encryption is not configured.");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptArchive(plaintext: string): {
  buffer: Buffer;
  checksum: string;
} {
  const key = getBackupKey();
  const checksum = crypto.createHash("sha256").update(plaintext, "utf8").digest("hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Packed format: 12 bytes IV + 16 bytes auth tag + ciphertext
  const buffer = Buffer.concat([iv, tag, encrypted]);
  return { buffer, checksum };
}

export function decryptArchive(
  buffer: Buffer,
  expectedChecksum?: string,
): { payload: Record<string, unknown>; checksum: string } {
  if (buffer.length < 28) throw new Error("Invalid backup archive format.");
  const key = getBackupKey();
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");

  const checksum = crypto.createHash("sha256").update(decrypted, "utf8").digest("hex");
  if (expectedChecksum && checksum !== expectedChecksum) {
    throw new Error("Backup archive checksum verification failed.");
  }

  const payload = JSON.parse(decrypted) as Record<string, unknown>;
  return { payload, checksum };
}

/** Gather all church-isolated data rows for a single tenant */
async function gatherTenantData(tenantId: string) {
  const db = await admin();

  const [
    tenantRes,
    branchesRes,
    usersRes,
    servicesRes,
    membersRes,
    attendanceRes,
    levelsRes,
    groupsRes,
    leadersRes,
    messagesRes,
    followupsRes,
    aiRes,
    auditsRes,
  ] = await Promise.all([
    db.from("tenants").select("*").eq("id", tenantId).single(),
    db.from("branches").select("*").eq("tenant_id", tenantId),
    db
      .from("tenant_users")
      .select("id, tenant_id, user_id, role, branch_id, position_id, status, created_at")
      .eq("tenant_id", tenantId),
    db.from("services").select("*").eq("tenant_id", tenantId),
    db.from("members").select("*").eq("tenant_id", tenantId),
    db.from("attendance").select("*").eq("tenant_id", tenantId),
    db.from("structure_levels").select("*").eq("tenant_id", tenantId),
    db.from("groups").select("*").eq("tenant_id", tenantId),
    db.from("leader_profiles").select("*").eq("tenant_id", tenantId),
    db.from("messages").select("*").eq("tenant_id", tenantId),
    db.from("member_followups").select("*").eq("tenant_id", tenantId),
    db.from("ask_mene_messages").select("*").eq("tenant_id", tenantId),
    db.from("audit_events").select("*").eq("tenant_id", tenantId),
  ]);

  if (!tenantRes.data) throw new Error("Church not found.");

  const counts: Record<string, number> = {
    branches: branchesRes.data?.length ?? 0,
    staff: usersRes.data?.length ?? 0,
    services: servicesRes.data?.length ?? 0,
    members: membersRes.data?.length ?? 0,
    attendance: attendanceRes.data?.length ?? 0,
    structure_levels: levelsRes.data?.length ?? 0,
    groups: groupsRes.data?.length ?? 0,
    leaders: leadersRes.data?.length ?? 0,
    messages: messagesRes.data?.length ?? 0,
    followups: followupsRes.data?.length ?? 0,
    ai_messages: aiRes.data?.length ?? 0,
    audit_events: auditsRes.data?.length ?? 0,
  };

  const payload = {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    tenant_id: tenantId,
    tenant_name: tenantRes.data.name,
    record_counts: counts,
    data: {
      tenant: tenantRes.data,
      branches: branchesRes.data ?? [],
      staff: usersRes.data ?? [],
      services: servicesRes.data ?? [],
      members: membersRes.data ?? [],
      attendance: attendanceRes.data ?? [],
      structure_levels: levelsRes.data ?? [],
      groups: groupsRes.data ?? [],
      leaders: leadersRes.data ?? [],
      messages: messagesRes.data ?? [],
      followups: followupsRes.data ?? [],
      ai_messages: aiRes.data ?? [],
      audit_events: auditsRes.data ?? [],
    },
  };

  return { payload, counts, tenantName: tenantRes.data.name };
}

/** Check that no backup/restore job is currently active for this church */
async function assertNoActiveJob(tenantId: string) {
  const db = await admin();
  const { data: active } = await db
    .from("tenant_backup_jobs")
    .select("id, kind, status")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (active) {
    throw new Error(
      `A ${active.kind} job is already in progress for this church. Please wait for it to complete.`,
    );
  }
}

/** Create an encrypted backup archive for one church */
export async function createTenantBackup(
  operatorUserId: string,
  tenantId: string,
  kind: "backup" | "pre_restore" = "backup",
) {
  await assertNoActiveJob(tenantId);
  const db = await admin();

  // Insert initial pending/running job
  const { data: job, error: jobError } = await db
    .from("tenant_backup_jobs")
    .insert({
      tenant_id: tenantId,
      requested_by: operatorUserId,
      kind,
      status: "running",
      started_at: new Date().toISOString(),
      schema_version: 1,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    throw new Error("Could not initialize backup job: " + (jobError?.message ?? "unknown"));
  }

  try {
    const { payload, counts, tenantName } = await gatherTenantData(tenantId);
    const jsonString = JSON.stringify(payload);
    const { buffer, checksum } = encryptArchive(jsonString);

    const storagePath = `${tenantId}/${job.id}.mlbak.enc`;

    // Attempt to store in tenant-backups bucket
    try {
      await db.storage.createBucket("tenant-backups", { public: false });
    } catch {
      /* bucket might already exist */
    }

    const { error: uploadError } = await db.storage
      .from("tenant-backups")
      .upload(storagePath, buffer, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (uploadError) {
      throw new Error("Storage upload failed: " + uploadError.message);
    }

    const expiresAt = new Date(Date.now() + 30 * 864e5).toISOString();

    await db
      .from("tenant_backup_jobs")
      .update({
        status: "completed",
        storage_path: storagePath,
        byte_size: buffer.byteLength,
        checksum,
        record_counts: counts,
        expires_at: expiresAt,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await audit(
      operatorUserId,
      kind === "pre_restore" ? "tenant.pre_restore_backup_created" : "tenant.backup_created",
      {
        backup_id: job.id,
        bytes: buffer.byteLength,
        checksum,
        records: counts,
      },
      tenantId,
    );

    return {
      ok: true as const,
      jobId: job.id,
      tenantName,
      byteSize: buffer.byteLength,
      checksum,
      counts,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Backup failed";
    await db
      .from("tenant_backup_jobs")
      .update({
        status: "failed",
        error_summary: msg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await audit(
      operatorUserId,
      "tenant.backup_failed",
      { backup_id: job.id, error: msg },
      tenantId,
    );
    throw err;
  }
}

/** Download an encrypted backup archive (returns base64 string and filename) */
export async function downloadEncryptedBackup(operatorUserId: string, backupId: string) {
  const db = await admin();
  const { data: job, error } = await db
    .from("tenant_backup_jobs")
    .select("id, tenant_id, storage_path, checksum, byte_size, status, created_at")
    .eq("id", backupId)
    .single();

  if (error || !job || !job.storage_path) {
    throw new Error("Backup file record not found.");
  }

  const { data: fileData, error: downloadError } = await db.storage
    .from("tenant-backups")
    .download(job.storage_path);

  if (downloadError || !fileData) {
    throw new Error("Encrypted backup file could not be read from storage.");
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  await audit(
    operatorUserId,
    "tenant.backup_downloaded",
    {
      backup_id: job.id,
      byte_size: buffer.byteLength,
      checksum: job.checksum,
    },
    job.tenant_id,
  );

  const filename = `backup-${job.tenant_id.slice(0, 8)}-${job.created_at.slice(0, 10)}.mlbak.enc`;
  return {
    filename,
    content_base64: buffer.toString("base64"),
    checksum: job.checksum,
    byte_size: buffer.byteLength,
  };
}

/** Restore a backup archive back into the SAME church */
export async function restoreTenantBackup(
  operatorUserId: string,
  input: {
    backupId: string;
    tenantId: string;
    confirmationName: string;
    operatorPassword: string;
    operatorUsername: string;
  },
) {
  const db = await admin();

  // 1. Verify operator credentials
  const op = await findOperator(input.operatorUsername);
  if (!op || !verifyPassword(input.operatorPassword, op.app_metadata.operator_hash)) {
    throw new Error("Operator credentials incorrect. Authentication required to execute restore.");
  }

  // 2. Fetch Church and verify exact name confirmation
  const { data: church } = await db
    .from("tenants")
    .select("id, name, status")
    .eq("id", input.tenantId)
    .single();

  if (!church) throw new Error("Target church not found.");
  if (church.name.trim() !== input.confirmationName.trim()) {
    throw new Error("Typed church confirmation name does not match the actual church name.");
  }

  // 3. Fetch source backup
  const { data: sourceJob } = await db
    .from("tenant_backup_jobs")
    .select("id, tenant_id, storage_path, checksum, record_counts, status")
    .eq("id", input.backupId)
    .single();

  if (!sourceJob || !sourceJob.storage_path) {
    throw new Error("Source backup job not found.");
  }
  if (sourceJob.tenant_id !== input.tenantId) {
    throw new Error("Security violation: Backups can only be restored into the same church.");
  }

  await assertNoActiveJob(input.tenantId);

  // 4. Create an automatic pre-restore backup first!
  const preRestore = await createTenantBackup(operatorUserId, input.tenantId, "pre_restore");

  // 5. Create restore job record
  const { data: restoreJob, error: rError } = await db
    .from("tenant_backup_jobs")
    .insert({
      tenant_id: input.tenantId,
      requested_by: operatorUserId,
      kind: "restore",
      status: "running",
      source_backup_id: sourceJob.id,
      started_at: new Date().toISOString(),
      schema_version: 1,
    })
    .select("id")
    .single();

  if (rError || !restoreJob) {
    throw new Error("Could not initialize restore tracking job.");
  }

  try {
    // 6. Download and decrypt backup archive
    const { data: fileData, error: downloadError } = await db.storage
      .from("tenant-backups")
      .download(sourceJob.storage_path);

    if (downloadError || !fileData) {
      throw new Error("Could not read backup file from storage.");
    }

    const encryptedBuffer = Buffer.from(await fileData.arrayBuffer());
    const { payload, checksum } = decryptArchive(encryptedBuffer, sourceJob.checksum || undefined);

    // Validate archive tenant matching
    if (payload["tenant_id"] !== input.tenantId) {
      throw new Error(
        "Archive tenant verification failed: archive does not belong to this church.",
      );
    }

    const rawData = payload["data"] as Record<string, unknown[]>;
    if (!rawData) throw new Error("Invalid archive payload structure.");

    // Sequential table restoration
    const members = (rawData["members"] ?? []) as Array<Record<string, unknown>>;
    const attendance = (rawData["attendance"] ?? []) as Array<Record<string, unknown>>;
    const services = (rawData["services"] ?? []) as Array<Record<string, unknown>>;
    const groups = (rawData["groups"] ?? []) as Array<Record<string, unknown>>;
    const levels = (rawData["structure_levels"] ?? []) as Array<Record<string, unknown>>;
    const leaders = (rawData["leaders"] ?? []) as Array<Record<string, unknown>>;

    if (levels.length) {
      await db.from("structure_levels").upsert(levels as never, { onConflict: "id" });
    }
    if (services.length) {
      await db.from("services").upsert(services as never, { onConflict: "id" });
    }
    if (members.length) {
      // Chunk upserts in batches of 200
      for (let i = 0; i < members.length; i += 200) {
        await db.from("members").upsert(members.slice(i, i + 200) as never, { onConflict: "id" });
      }
    }
    if (attendance.length) {
      for (let i = 0; i < attendance.length; i += 200) {
        await db
          .from("attendance")
          .upsert(attendance.slice(i, i + 200) as never, { onConflict: "id" });
      }
    }
    if (groups.length) {
      await db.from("groups").upsert(groups as never, { onConflict: "id" });
    }
    if (leaders.length) {
      await db.from("leader_profiles").upsert(leaders as never, { onConflict: "id" });
    }

    // Complete job
    await db
      .from("tenant_backup_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        checksum,
        record_counts: sourceJob.record_counts,
      })
      .eq("id", restoreJob.id);

    await audit(
      operatorUserId,
      "tenant.restored",
      {
        restore_job_id: restoreJob.id,
        source_backup_id: sourceJob.id,
        pre_restore_backup_id: preRestore.jobId,
        restored_records: sourceJob.record_counts,
      },
      input.tenantId,
    );

    return {
      ok: true as const,
      message: `Church records successfully restored. Pre-restore snapshot ID: ${preRestore.jobId}`,
      restoredRecords: sourceJob.record_counts,
      preRestoreBackupId: preRestore.jobId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Restore failed";
    await db
      .from("tenant_backup_jobs")
      .update({
        status: "failed",
        error_summary: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", restoreJob.id);

    await audit(
      operatorUserId,
      "tenant.restore_failed",
      {
        restore_job_id: restoreJob.id,
        source_backup_id: sourceJob.id,
        error: errorMsg,
      },
      input.tenantId,
    );
    throw err;
  }
}
