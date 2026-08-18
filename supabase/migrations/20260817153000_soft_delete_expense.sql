CREATE OR REPLACE FUNCTION public.soft_delete_expense(
  p_expense_id uuid,
  p_user_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  app_user_id uuid;
  expense_row public.expenses%ROWTYPE;
  expense_group_name text;
  participant_ids jsonb;
BEGIN
  SELECT u.id
  INTO app_user_id
  FROM public.users u
  WHERE u.auth_user_id = (SELECT auth.uid())
  LIMIT 1;

  IF app_user_id IS NULL THEN
    RAISE EXCEPTION 'A signed-in user is required to delete an expense.';
  END IF;

  SELECT e.*
  INTO expense_row
  FROM public.expenses e
  WHERE e.id = p_expense_id
    AND e.deleted_at IS NULL;

  IF expense_row.id IS NULL THEN
    RAISE EXCEPTION 'Expense was not found or has already been deleted.';
  END IF;

  IF expense_row.created_by <> app_user_id AND expense_row.paid_by <> app_user_id THEN
    RAISE EXCEPTION 'Only the creator or payer can delete this expense.';
  END IF;

  SELECT group_row.name
  INTO expense_group_name
  FROM public.groups group_row
  WHERE group_row.id = expense_row.group_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(s.user_id)), '[]'::jsonb)
  INTO participant_ids
  FROM public.expense_splits s
  WHERE s.expense_id = p_expense_id
    AND s.amount > 0;

  IF NOT participant_ids ? expense_row.paid_by::text THEN
    participant_ids := participant_ids || jsonb_build_array(expense_row.paid_by);
  END IF;

  UPDATE public.expenses
  SET deleted_at = NOW(),
      deleted_by = app_user_id,
      updated_at = NOW()
  WHERE id = p_expense_id;

  INSERT INTO public.activities (
    type,
    user_id,
    user_name,
    target_id,
    group_id,
    group_name,
    description,
    amount,
    metadata
  ) VALUES (
    'expense_deleted',
    app_user_id,
    p_user_name,
    expense_row.id,
    expense_row.group_id,
    expense_group_name,
    expense_row.description,
    expense_row.amount,
    jsonb_build_object('participantIds', participant_ids)::text
  );

  RETURN jsonb_build_object(
    'id', expense_row.id,
    'description', expense_row.description,
    'amount', expense_row.amount,
    'groupId', expense_row.group_id,
    'groupName', expense_group_name,
    'participantIds', participant_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_expense(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_expense(uuid, text) TO authenticated;
