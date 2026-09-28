-- 0029_allow_review_update.sql
-- Allow church administrators to update their existing reviews and fetch full review state

CREATE OR REPLACE FUNCTION public.submit_church_review(
  p_tenant uuid, p_rating smallint, p_quote text, p_author_name text, p_author_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Please choose a rating from 1 to 5'; END IF;
  IF length(btrim(coalesce(p_quote,''))) < 20 OR length(p_quote) > 600 THEN
    RAISE EXCEPTION 'Please write between 20 and 600 characters';
  END IF;

  IF EXISTS (SELECT 1 FROM public.church_reviews WHERE user_id = auth.uid()) THEN
    UPDATE public.church_reviews
    SET rating = p_rating,
        quote = btrim(p_quote),
        author_name = coalesce(nullif(btrim(coalesce(p_author_name,'')),''), 'Church leader'),
        author_role = nullif(btrim(coalesce(p_author_role,'')),''),
        status = 'pending',
        reviewed_at = null
    WHERE user_id = auth.uid()
    RETURNING id INTO v_id;
    PERFORM public.log_audit(p_tenant, 'review.updated', v_id::text, '{}'::jsonb, null, auth.uid());
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'updated', true);
  END IF;

  INSERT INTO public.church_reviews (tenant_id, user_id, rating, quote, author_name, author_role)
  VALUES (p_tenant, auth.uid(), p_rating, btrim(p_quote),
          coalesce(nullif(btrim(coalesce(p_author_name,'')),''), 'Church leader'),
          nullif(btrim(coalesce(p_author_role,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant, 'review.submitted', v_id::text, '{}'::jsonb, null, auth.uid());
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.my_review_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
      'submitted', true,
      'status', status,
      'rating', rating,
      'quote', quote,
      'author_name', author_name,
      'author_role', author_role,
      'created_at', created_at,
      'reviewed_at', reviewed_at
    )
     FROM public.church_reviews WHERE user_id = auth.uid()),
    jsonb_build_object('submitted', false))
$$;

REVOKE ALL ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.my_review_state() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_review_state() TO authenticated;
