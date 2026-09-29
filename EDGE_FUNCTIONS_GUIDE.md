# Mene:Log Supabase Edge Functions Guide & Alert Templates

This guide details how to deploy, configure, and trigger the two dedicated Supabase Edge Functions for **SMS alerts** (via Arkesel with the verified `"Mene Log"` sender ID) and **Email alerts** (via Resend to `primehaven26@gmail.com` and church administrators).

---

## 1. Edge Function Files Created

The functions reside in your project directory:

| Edge Function | File Path | Purpose |
| :--- | :--- | :--- |
| **`send-sms-alerts`** | `supabase/functions/send-sms-alerts/index.ts` | Dispatches SMS via Arkesel v2 to `+233550160237` and church/branch contacts using sender ID `"Mene Log"` |
| **`send-email-alerts`** | `supabase/functions/send-email-alerts/index.ts` | Dispatches styled HTML emails via Resend to `primehaven26@gmail.com` and church administrators |

---

## 2. How to Feed & Deploy to Supabase

You can deploy the edge functions using either the **Supabase Web Dashboard** or the **Supabase CLI**.

### Option A: Via Supabase Dashboard (No CLI needed)

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard/project/pmkimlbvdzgduxgxucsx).
2. Go to **Edge Functions** in the left sidebar menu.
3. Click **"New Function"**:
   - Name: `send-sms-alerts`
   - Paste the complete code from `supabase/functions/send-sms-alerts/index.ts`
   - Click **Save & Deploy**.
4. Repeat for the second function:
   - Name: `send-email-alerts`
   - Paste the complete code from `supabase/functions/send-email-alerts/index.ts`
   - Click **Save & Deploy**.

---

### Option B: Via Supabase CLI

From your terminal in the project directory, run:

```bash
# Login to Supabase CLI (if not already authenticated)
npx supabase login

# Link your project (Project ID: pmkimlbvdzgduxgxucsx)
npx supabase link --project-ref pmkimlbvdzgduxgxucsx

# Deploy both functions
npx supabase functions deploy send-sms-alerts --no-verify-jwt
npx supabase functions deploy send-email-alerts --no-verify-jwt
```

---

## 3. Required Secrets & Environment Variables

In your **Supabase Dashboard → Project Settings → Edge Functions → Secrets**, add the following keys:

| Secret Name | Value Example | Description |
| :--- | :--- | :--- |
| `ARKESEL_API_KEY` | `YOUR_ARKESEL_API_KEY` | Your Arkesel SMS gateway API key |
| `ARKESEL_SENDER_ID` | `Mene Log` | The verified alphanumeric sender ID |
| `ADMIN_HOTLINE_PHONE`| `+233550160237` | Technical SMS hotline recipient |
| `RESEND_API_KEY` | `re_123456789...` | Your Resend API key |
| `RESEND_FROM_EMAIL` | `Mene:Log Alerts <alerts@menelog.site>` | Sender address (or `onboarding@resend.dev` for test) |
| `ADMIN_ALERT_EMAIL` | `primehaven26@gmail.com` | Primary administrator recipient |
| `APP_URL` | `https://menelog.site` | Base URL for direct billing/support links |

---

## 4. How to Trigger the Functions

Both functions support **Supabase Database Webhooks** and **Direct HTTP API calls**.

### A. Automatic Database Webhook Trigger (Recommended)
1. Go to **Supabase Dashboard → Database → Webhooks**.
2. Click **Create Webhook**:
   - **Name**: `on-ticket-created-sms`
   - **Table**: `public.support_tickets`
   - **Events**: `INSERT`
   - **Type**: `Edge Function`
   - **Function**: `send-sms-alerts`
3. Create a second webhook for tickets email:
   - **Name**: `on-ticket-created-email`
   - **Table**: `public.support_tickets`
   - **Events**: `INSERT`
   - **Type**: `Edge Function`
   - **Function**: `send-email-alerts`
4. Repeat for `public.tenants` table on `INSERT` to trigger new church signup alerts.

### B. Direct HTTP API Call Example
```bash
# Trigger an SMS alert directly:
curl -X POST https://pmkimlbvdzgduxgxucsx.supabase.co/functions/v1/send-sms-alerts \
  -H "Authorization: Bearer <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "support_ticket",
    "data": {
      "id": "tick_8f93e",
      "church_name": "Grace Assembly",
      "subject": "Need help with Sunday QR code",
      "priority": "high",
      "contact_phone": "0244123456"
    }
  }'
```

---

## 5. Visual Previews & Framing for All Alerts

### A. SMS Messages (Sender ID: `Mene Log`)

#### 1. Support Ticket Created
- **Hotline (`+233550160237`)**:
  ```text
  [Mene:Log Support] [HIGH] New ticket from Grace Assembly: "Need help with Sunday QR code". ID: tick_8f9
  ```
- **Church Contact (`0244123456` or custom recipients)**:
  ```text
  [Mene:Log Support] We received your ticket "Need help with Sunday QR code". Our support team is attending to it. Track at menelog.site/support
  ```

#### 2. New Church Sign Up
- **Hotline (`+233550160237`)**:
  ```text
  [Mene:Log Alert] New church registered: "Victory Baptist Church" (victory.menelog.site) on PRO tier. Phone: +233244123456, Email: pastor@victory.org
  ```

#### 3. Branch Church Sign Up
- **Hotline (`+233550160237`) & Main Church Pastor**:
  ```text
  [Mene:Log Branch] New branch "Spintex Campus" added under Victory Baptist Church. Leader: Pastor John (+233501112233).
  ```

#### 4. 30-Day Trial Expiration Warnings
- **7 Days Before**:
  ```text
  [Mene:Log] Reminder: Your 30-day trial for Victory Baptist Church ends in 7 days. Subscribe at menelog.site/billing to ensure continuous check-in.
  ```
- **3 Days Before**:
  ```text
  [Mene:Log Alert] Urgent: Your 30-day trial for Victory Baptist Church ends in 3 days. Renew now at menelog.site/billing to prevent service interruption.
  ```
- **Day of Expiry**:
  ```text
  [Mene:Log Notice] Your 30-day trial for Victory Baptist Church has expired today. Activate your subscription at menelog.site/billing to unlock full services.
  ```

#### 5. Payment Success
- **Hotline & Church Admin**:
  ```text
  [Mene:Log Billing] Payment successful! GHS 250.00 received for Victory Baptist Church (STANDARD tier). Ref: pay_89f02a. Thank you!
  ```

#### 6. Payment Failed
- **Hotline & Church Admin**:
  ```text
  [Mene:Log Billing] Payment failed for Victory Baptist Church (GHS 250.00): Insufficient funds on Mobile Money wallet. Please update your payment method at menelog.site/billing
  ```

---

### B. HTML Email Templates (To `primehaven26@gmail.com` & Church Admins)

Each email is crafted with the dark-navy Mene:Log identity, responsive typography, itemized tables, and primary call-to-action buttons.

#### 1. Trial Expiration Warning Email (7 Days, 3 Days, and Expiry Day)
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations       [3 DAYS LEFT] |
+--------------------------------------------------------------+
| ACTION REQUIRED: UPCOMING EXPIRY                             |
|                                                              |
| Urgent: 3 Days Remaining on Your 30-Day Trial                |
|                                                              |
| [ Container Box ]                                            |
| This is a reminder that only 3 days remain on the 30-day     |
| trial for Victory Baptist Church. Subscribe now to preserve  |
| continuous access for your congregation and leadership team. |
|                                                              |
| Church:       Victory Baptist Church                         |
| Check-in URL: victory.menelog.site                           |
|                                                              |
|             [ Pay & Activate Platform -> ]                   |
+--------------------------------------------------------------+
| Mene:Log Automated Notification System · Accra, Ghana        |
+--------------------------------------------------------------+
```

#### 2. Payment Success Receipt Email
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations      [PAID & ACTIVE] |
+--------------------------------------------------------------+
| OFFICIAL PAYMENT CONFIRMATION                                |
|                                                              |
| Payment Receipt: GHS 250.00 Received                         |
|                                                              |
| [ Container Box ]                                            |
| v Payment Received Successfully                              |
| Thank you for supporting your church's growth with Mene:Log. |
| Your payment has been confirmed and all features on your     |
| STANDARD plan remain fully unlocked.                         |
|                                                              |
| Amount Paid:     GHS 250.00                                  |
| Plan Tier:       STANDARD Package                            |
| Church Account:  Victory Baptist Church                      |
| Transaction Ref: pay_89f02a1b93                              |
| Date & Time:     Sun, 29 Sep 2026 15:45:00 GMT               |
|                                                              |
|             [ Open Billing Dashboard -> ]                    |
+--------------------------------------------------------------+
| This receipt serves as official confirmation of payment.     |
+--------------------------------------------------------------+
```

#### 3. Payment Failed Notice Email
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations     [PAYMENT FAILED] |
+--------------------------------------------------------------+
| IMMEDIATE ATTENTION REQUIRED                                 |
|                                                              |
| Payment Attempt Failed for Victory Baptist Church            |
|                                                              |
| [ Container Box ]                                            |
| Payment Could Not Be Completed                               |
| An attempt to process your payment of GHS 250.00 for         |
| Victory Baptist Church was unsuccessful.                     |
|                                                              |
| Decline Reason: Insufficient Mobile Money balance.           |
| Reference:      pay_failed_4901                              |
| Next Steps:     Retry using Mobile Money or Visa/Mastercard. |
|                                                              |
|                [ Retry Payment Now -> ]                      |
+--------------------------------------------------------------+
| Your church account remains temporarily protected.           |
+--------------------------------------------------------------+
```

#### 4. New Church Sign Up Alert Email (Sent to `primehaven26@gmail.com`)
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations        [NEW CHURCH] |
+--------------------------------------------------------------+
| PLATFORM GROWTH ALERT                                        |
|                                                              |
| New Church Registration: Victory Baptist Church              |
|                                                              |
| [ Container Box ]                                            |
| A new church organization has successfully signed up and     |
| begun their 30-day trial on Mene:Log.                        |
|                                                              |
| Church Name:      Victory Baptist Church                     |
| Subdomain:        victory.menelog.site                       |
| Package Selected: STANDARD (30-Day Trial)                    |
| Admin Phone:      +233244123456                              |
| Admin Email:      pastor@victory.org                         |
| Registered At:    Sun, 29 Sep 2026 15:50:00 GMT              |
|                                                              |
|            [ Review in Platform Console -> ]                 |
+--------------------------------------------------------------+
| Instant notification dispatched on church account creation.  |
+--------------------------------------------------------------+
```

#### 5. Branch Church Registration Email (To Main Church & `primehaven26@gmail.com`)
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations     [BRANCH CAMPUS] |
+--------------------------------------------------------------+
| MULTI-CAMPUS EXPANSION                                       |
|                                                              |
| New Branch Added: Spintex Campus                             |
|                                                              |
| [ Container Box ]                                            |
| A new branch campus has been registered under                |
| Victory Baptist Church.                                      |
|                                                              |
| Branch Name:    Spintex Campus (Accra)                       |
| Parent Church:  Victory Baptist Church                       |
| Branch Leader:  Pastor John Mensah                           |
| Leader Contact: +233501112233 / jmensah@victory.org         |
|                                                              |
|             [ Manage Branch Campuses -> ]                    |
+--------------------------------------------------------------+
| Dispatched to head office administrators and operations.     |
+--------------------------------------------------------------+
```

#### 6. Support Ticket Alert Email (To `primehaven26@gmail.com`)
```
+--------------------------------------------------------------+
| Mene:Log | Church Attendance & Operations     [HIGH PRIORITY] |
+--------------------------------------------------------------+
| NEW SUPPORT INQUIRY                                          |
|                                                              |
| Support Ticket: Need help with Sunday QR code                |
|                                                              |
| [ Container Box ]                                            |
| Church:    Victory Baptist Church                            |
| Ticket ID: tick_8f93e10a                                     |
| Priority:  HIGH                                              |
| Submitter: admin@victory.org                                 |
|                                                              |
| Quote:                                                       |
| "Our Sunday service QR code scanned slow on two devices.     |
| Could you help us check network cache or provide backup?"   |
|                                                              |
|              [ Open Ticket in Console -> ]                   |
+--------------------------------------------------------------+
| Dispatched to primehaven26@gmail.com technical hotline.      |
+--------------------------------------------------------------+
```
