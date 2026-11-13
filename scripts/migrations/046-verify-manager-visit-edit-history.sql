SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='scheduled_visits' AND column_name='visit_timezone'
  ) AS visit_timezone_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.scheduled_visits'::regclass
      AND conname='scheduled_visits_visit_timezone_check'
      AND pg_get_constraintdef(oid) LIKE '%America/New_York%'
  ) AS visit_timezone_constraint_ok,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_corrections' AND column_name='change_type'
  ) AS change_type_exists,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_corrections' AND column_name='care_verified'
      AND data_type='boolean' AND is_nullable='NO'
  ) AS care_verified_exists,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_corrections'
      AND column_name IN (
        'previous_visit_date','corrected_visit_date','previous_scheduled_start_time',
        'corrected_scheduled_start_time','previous_scheduled_end_date','corrected_scheduled_end_date',
        'previous_scheduled_end_time','corrected_scheduled_end_time',
        'previous_actual_start_time','previous_actual_end_time'
      )) = 10 AS schedule_and_time_history_columns_exist,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='visit_adjustment_history'
      AND column_name IN (
        'previous_pay_rate','current_pay_rate','previous_bill_rate','current_bill_rate',
        'previous_pay_amount','current_pay_amount','previous_bill_amount','current_bill_amount',
        'previous_financial_status','current_financial_status'
      )) = 10 AS financial_decision_history_columns_exist,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.visit_corrections'::regclass
      AND conname='visit_corrections_change_type_check'
      AND pg_get_constraintdef(oid) LIKE '%manager_manual_time%'
  ) AS change_type_constraint_ok,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.visit_corrections'::regclass
      AND conname='visit_corrections_care_verified_check'
      AND pg_get_constraintdef(oid) LIKE '%manager_manual_time%'
  ) AS care_verified_constraint_ok,
  EXISTS (SELECT 1 FROM pg_class WHERE oid='public.visit_corrections'::regclass
    AND relrowsecurity AND relforcerowsecurity) AS correction_history_forced_rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='visit_corrections') = 2
    AS correction_history_policy_set_unchanged,
  has_table_privilege('mycaresight_app','public.visit_corrections','SELECT,INSERT')
    AND NOT has_table_privilege('mycaresight_app','public.visit_corrections','UPDATE,DELETE')
    AS correction_history_remains_append_only,
  has_column_privilege('mycaresight_app','public.scheduled_visits','visit_timezone','UPDATE')
    AS runtime_can_update_visit_timezone,
  has_column_privilege('mycaresight_app','public.visit_time_entries','adjusted_start_time','INSERT')
    AND has_column_privilege('mycaresight_app','public.visit_time_entries','adjusted_end_time','INSERT')
    AND has_column_privilege('mycaresight_app','public.visit_time_entries','adjusted_start_time','UPDATE')
    AND has_column_privilege('mycaresight_app','public.visit_time_entries','adjusted_end_time','UPDATE')
    AS runtime_can_write_manager_adjusted_time,
  NOT has_column_privilege('mycaresight_app','public.visit_time_entries','clock_in_time','UPDATE')
    AND NOT has_column_privilege('mycaresight_app','public.visit_time_entries','clock_out_time','UPDATE')
    AS caregiver_clock_evidence_remains_protected,
  has_column_privilege('mycaresight_app','public.visit_adjustment_history','previous_pay_rate','INSERT')
    AND has_column_privilege('mycaresight_app','public.visit_adjustment_history','current_bill_amount','INSERT')
    AND has_column_privilege('mycaresight_app','public.visit_adjustment_history','current_financial_status','INSERT')
    AND NOT has_table_privilege('mycaresight_app','public.visit_adjustment_history','UPDATE,DELETE')
    AS financial_decision_history_is_append_only;
