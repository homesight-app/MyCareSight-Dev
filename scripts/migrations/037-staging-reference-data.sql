-- 037: Populate an empty Neon staging branch with the reviewed, non-PHI UAT reference baseline.
-- Environment-scoped staging seed: do not apply to protected Production. Live Production
-- reference rows require source reconciliation at cutover.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public;

DO $preflight$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    RAISE EXCEPTION '037 must not run against Supabase';
  END IF;
  IF to_regclass('public.task_categories') IS NULL
     OR to_regclass('public.task_catalog') IS NULL
     OR to_regclass('public.configuration_types') IS NULL
     OR to_regclass('public.configuration_values') IS NULL
     OR to_regclass('public.credential_catalog') IS NULL
     OR to_regclass('public.task_required_credentials') IS NULL
     OR to_regclass('public.license_types') IS NULL
     OR to_regclass('public.pricing') IS NULL
     OR to_regclass('public.billing_codes') IS NULL
     OR to_regclass('public.validation_rules') IS NULL
     OR to_regclass('public.audit_log') IS NULL THEN
    RAISE EXCEPTION '037 requires the current Neon reference schema and audit_log';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mycaresight_app' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
  ) OR pg_has_role('mycaresight_app', current_user, 'MEMBER') THEN
    RAISE EXCEPTION '037 requires an independent migration owner and restricted runtime role';
  END IF;
END
$preflight$;

CREATE TEMP TABLE _seed_task_categories ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.task_categories, $reference_seed$[
  {
    "id": "00e350d6-99c9-42f9-8ccb-3e64604f510b",
    "name": "Lab & Diagnostics",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "name": "IADL",
    "service_type": "non_skilled",
    "display_order": 0
  },
  {
    "id": "0819bdb5-9d1d-4887-b6bc-a7bd9d0a7539",
    "name": "Nutrition Support",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "name": "Clinical Care",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "name": "Specialty Conditions",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "21fb5ff7-d3c3-4734-ab8e-3abef46eb998",
    "name": "Vital Signs & Monitoring",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "name": "ADL",
    "service_type": "non_skilled",
    "display_order": 0
  },
  {
    "id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "name": "Language",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "469e7864-be92-49f9-bcb9-e499d2fa1fbd",
    "name": "Medication Management",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "4734295e-fea1-4bc0-989f-2b78f2d5dd2f",
    "name": "Catheter & Elimination",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "5446357e-fa10-436c-8780-67cac6ed8349",
    "name": "Certifications",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "a82ffb69-ba0b-4a57-afb0-d8eac01f7d9d",
    "name": "Physical / OT",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "a93f2ae2-d664-430c-83a4-765db809a6b4",
    "name": "Physical Support",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "ba46a6a3-0b3f-4247-82d8-9980d3af49ac",
    "name": "Wound Care",
    "service_type": "skilled",
    "display_order": 0
  },
  {
    "id": "e3ece539-9b01-44d6-84e7-75e2fae02b45",
    "name": "Respiratory Care",
    "service_type": "skilled",
    "display_order": 0
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_task_categories ON COMMIT DROP AS SELECT * FROM public.task_categories;

CREATE TEMP TABLE _seed_task_catalog ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.task_catalog, $reference_seed$[
  {
    "id": "03450563-13f4-4e3a-a099-4bc199eb65b3",
    "code": "task_cg_bilingual_mandarin",
    "name": "Bilingual â€” Mandarin",
    "is_active": true,
    "is_skilled": true,
    "category_id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "description": null,
    "display_order": 370
  },
  {
    "id": "04059212-43a7-4061-9443-d250a291371d",
    "code": "oxygen_management",
    "name": "Oxygen Management",
    "is_active": true,
    "is_skilled": true,
    "category_id": "e3ece539-9b01-44d6-84e7-75e2fae02b45",
    "description": "Oxygen delivery device setup and monitoring",
    "display_order": 320
  },
  {
    "id": "05d4434a-270a-4f7f-854c-52d7f0f4b3f5",
    "code": "pain_assessment",
    "name": "Pain Assessment",
    "is_active": true,
    "is_skilled": true,
    "category_id": "21fb5ff7-d3c3-4734-ab8e-3abef46eb998",
    "description": "Structured pain scale assessment and documentation",
    "display_order": 240
  },
  {
    "id": "089d04df-0e3c-4c29-ad8a-d9487c5a79fa",
    "code": "personal_hygiene",
    "name": "Personal Hygiene",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 40
  },
  {
    "id": "0a125a31-69ab-443a-af2b-805809d52f2c",
    "code": "ecg_telemetry_monitoring",
    "name": "ECG / Telemetry Monitoring",
    "is_active": true,
    "is_skilled": true,
    "category_id": "00e350d6-99c9-42f9-8ccb-3e64604f510b",
    "description": "Cardiac rhythm monitoring and documentation",
    "display_order": 730
  },
  {
    "id": "0c8e4b4b-9411-4eaf-963c-804ef9246bdb",
    "code": "task_cg_tracheostomy_care",
    "name": "Tracheostomy Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 50
  },
  {
    "id": "0d901daa-b957-49ab-bf5a-a501cd85f454",
    "code": "task_cg_alzheimers_dementia_care",
    "name": "Alzheimer's / Dementia Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 110
  },
  {
    "id": "187a06f2-1dee-4b9c-bd44-2d2957083321",
    "code": "injection_administration",
    "name": "Injection Administration",
    "is_active": true,
    "is_skilled": true,
    "category_id": "469e7864-be92-49f9-bcb9-e499d2fa1fbd",
    "description": "Subcutaneous or intramuscular injections",
    "display_order": 130
  },
  {
    "id": "19db011a-dfe4-41e3-a24a-f6ab2996cad0",
    "code": "nebulizer_treatment",
    "name": "Nebulizer Treatment",
    "is_active": true,
    "is_skilled": true,
    "category_id": "e3ece539-9b01-44d6-84e7-75e2fae02b45",
    "description": "Administer nebulized medication per order",
    "display_order": 310
  },
  {
    "id": "1b80f587-f5dd-4be1-a2c2-3ac4d1b20b19",
    "code": "urine_specimen_collection",
    "name": "Urine Specimen Collection",
    "is_active": true,
    "is_skilled": true,
    "category_id": "00e350d6-99c9-42f9-8ccb-3e64604f510b",
    "description": "Urine collection for urinalysis or culture",
    "display_order": 720
  },
  {
    "id": "293b0228-c19f-4b61-9504-70b5b717921b",
    "code": "iv_therapy",
    "name": "IV Therapy",
    "is_active": true,
    "is_skilled": true,
    "category_id": "469e7864-be92-49f9-bcb9-e499d2fa1fbd",
    "description": "IV line management and infusion administration",
    "display_order": 120
  },
  {
    "id": "2b15753a-96b3-4668-b208-50ae3f19d9a1",
    "code": "task_cg_iv_therapy",
    "name": "IV Therapy",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 70
  },
  {
    "id": "326ae3fc-cfc0-4dfb-8405-0e00b8d67ea5",
    "code": "dressing",
    "name": "Dressing",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 30
  },
  {
    "id": "32e3784b-46cd-4d72-a20c-7187c1966b33",
    "code": "tube_feeding",
    "name": "Tube Feeding",
    "is_active": true,
    "is_skilled": true,
    "category_id": "0819bdb5-9d1d-4887-b6bc-a7bd9d0a7539",
    "description": "NG/G-tube feeding administration and tube care",
    "display_order": 510
  },
  {
    "id": "3373f152-5470-4204-a0d1-fd98a42672fb",
    "code": "continenece",
    "name": "Continenece",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 50
  },
  {
    "id": "38008cf3-0e95-483c-8925-dfe7caeab923",
    "code": "task_cg_aed_certified",
    "name": "AED Certified",
    "is_active": true,
    "is_skilled": true,
    "category_id": "5446357e-fa10-436c-8780-67cac6ed8349",
    "description": null,
    "display_order": 330
  },
  {
    "id": "3fb04582-e0e9-4504-ab58-3db664367d5a",
    "code": "medication_administration",
    "name": "Medication Administration",
    "is_active": true,
    "is_skilled": true,
    "category_id": "469e7864-be92-49f9-bcb9-e499d2fa1fbd",
    "description": "Administer medications per physician order",
    "display_order": 110
  },
  {
    "id": "415b770b-de70-488c-b1c7-d921e61eb05c",
    "code": "task_cg_parkinsons_care",
    "name": "Parkinson's Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 120
  },
  {
    "id": "422d5427-af36-41dd-b009-93138f47ffa6",
    "code": "medication_teaching",
    "name": "Medication Teaching",
    "is_active": true,
    "is_skilled": true,
    "category_id": "469e7864-be92-49f9-bcb9-e499d2fa1fbd",
    "description": "Patient/family education on medications",
    "display_order": 140
  },
  {
    "id": "42a24761-f526-4da1-a466-7ed726005413",
    "code": "task_cg_stroke_care",
    "name": "Stroke Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 130
  },
  {
    "id": "43e9d2c1-7589-4e3e-b4ea-ff18d5638a07",
    "code": "transportation",
    "name": "Transportation",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 110
  },
  {
    "id": "46bacc32-9181-4b27-b96a-02d9f163081b",
    "code": "task_cg_pediatric_care",
    "name": "Pediatric Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 200
  },
  {
    "id": "499ee4d1-ebf9-489d-b0fd-031edfb76396",
    "code": "task_cg_oxygen_therapy",
    "name": "Oxygen Therapy",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 60
  },
  {
    "id": "4a159751-ec93-4393-8563-0f536175060e",
    "code": "managing_finances",
    "name": "Managing Finances",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 120
  },
  {
    "id": "4b5641a6-c1c9-457c-a68b-e9fc1ec8bef3",
    "code": "feeding",
    "name": "Feeding",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 20
  },
  {
    "id": "4d81ca73-75bc-45ac-a612-6098eb07093f",
    "code": "range_of_motion_exercises",
    "name": "Range of Motion Exercises",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a82ffb69-ba0b-4a57-afb0-d8eac01f7d9d",
    "description": "Active or passive ROM to all extremities",
    "display_order": 410
  },
  {
    "id": "4dfa98cf-9965-42f0-ae10-44abdcb39c42",
    "code": "managing_medications",
    "name": "Managing Medications",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 170
  },
  {
    "id": "4f1e2a0d-b74a-4339-b706-7efb72ab6dec",
    "code": "task_cg_fall_prevention",
    "name": "Fall Prevention",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a93f2ae2-d664-430c-83a4-765db809a6b4",
    "description": null,
    "display_order": 240
  },
  {
    "id": "4fc44995-d32e-44e9-89c3-55692877ae1c",
    "code": "task_cg_first_aid_certified",
    "name": "First Aid Certified",
    "is_active": true,
    "is_skilled": true,
    "category_id": "5446357e-fa10-436c-8780-67cac6ed8349",
    "description": null,
    "display_order": 340
  },
  {
    "id": "51d49cb4-cec0-435a-9883-50f635765670",
    "code": "housecleaning_home_maintenance",
    "name": "Light Housekeeping",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 150
  },
  {
    "id": "534cfe36-d876-4801-9803-a296594d4190",
    "code": "task_cg_vital_signs_monitoring",
    "name": "Vital Signs Monitoring",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 90
  },
  {
    "id": "550e918d-67a1-4d50-8424-7891255a90b2",
    "code": "task_cg_dialysis_support",
    "name": "Dialysis Support",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 100
  },
  {
    "id": "5a35801e-a3ab-4304-a812-b71ade80238b",
    "code": "skilled_fwefew_moa1z2iv",
    "name": "fwefew",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 0
  },
  {
    "id": "5c99e90b-e07a-4468-8f0c-a60e6353a79d",
    "code": "task_cg_ot_assistance",
    "name": "Occupational Therapy Assistance",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a93f2ae2-d664-430c-83a4-765db809a6b4",
    "description": null,
    "display_order": 260
  },
  {
    "id": "5fef90b3-7db6-404d-8559-75fda4913671",
    "code": "catheter_care",
    "name": "Catheter Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "4734295e-fea1-4bc0-989f-2b78f2d5dd2f",
    "description": "Foley catheter care and maintenance",
    "display_order": 610
  },
  {
    "id": "60b0f7e3-7ed0-4db3-90e4-db5aee76f7a4",
    "code": "task_cg_post_surgery_recovery",
    "name": "Post-Surgery Recovery",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 180
  },
  {
    "id": "60e13578-e9a3-442d-82ce-e22bcaae754d",
    "code": "dysphagia_management",
    "name": "Dysphagia Management",
    "is_active": true,
    "is_skilled": true,
    "category_id": "0819bdb5-9d1d-4887-b6bc-a7bd9d0a7539",
    "description": "Swallowing assessment and diet modification",
    "display_order": 530
  },
  {
    "id": "6277a8fd-a62d-453e-a5bf-33314bc73574",
    "code": "skilled_qwerqew_mnzrclv0",
    "name": "qwerqew",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 0
  },
  {
    "id": "6446d409-cabe-4d6c-a054-2d6b87946367",
    "code": "non_skilled_companionship_mv9tywli",
    "name": "Companionship",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": null,
    "display_order": 0
  },
  {
    "id": "69ed7886-6a6c-41e7-a99b-8cfe057f56c3",
    "code": "task_cg_feeding_tube_care",
    "name": "Feeding Tube Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 40
  },
  {
    "id": "73c42ab7-ab4b-4182-ba46-58450cc1863a",
    "code": "lab_draw_venipuncture",
    "name": "Lab Draw / Venipuncture",
    "is_active": true,
    "is_skilled": true,
    "category_id": "00e350d6-99c9-42f9-8ccb-3e64604f510b",
    "description": "Blood draw per laboratory order",
    "display_order": 710
  },
  {
    "id": "74a45fdf-52ff-4896-bf10-154100256f6f",
    "code": "task_cg_behavioral_health_support",
    "name": "Behavioral Health Support",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 220
  },
  {
    "id": "77fddae7-fd2d-4248-ac53-cf51954c1668",
    "code": "task_cg_cpr_certified",
    "name": "CPR Certified",
    "is_active": true,
    "is_skilled": true,
    "category_id": "5446357e-fa10-436c-8780-67cac6ed8349",
    "description": null,
    "display_order": 320
  },
  {
    "id": "7a80a073-581d-4cce-9a0b-80f2bc15ad6e",
    "code": "toileting",
    "name": "Toileting",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 60
  },
  {
    "id": "7b6c3b8a-6dbb-4c52-8f50-490cf5fe1a00",
    "code": "ostomy_care",
    "name": "Ostomy Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "ba46a6a3-0b3f-4247-82d8-9980d3af49ac",
    "description": "Ostomy pouch change and skin assessment",
    "display_order": 30
  },
  {
    "id": "7f0b5029-6b56-49c9-bf57-e70d27192458",
    "code": "task_cg_bilingual_spanish",
    "name": "Bilingual â€” Spanish",
    "is_active": true,
    "is_skilled": true,
    "category_id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "description": null,
    "display_order": 350
  },
  {
    "id": "8aaf17f8-14ab-42ff-bad0-a7852e4d3e09",
    "code": "meal_preparation",
    "name": "Meal Preparation",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 140
  },
  {
    "id": "92f58ec9-20af-4534-8370-c92d38b0ba60",
    "code": "task_cg_ostomy_care",
    "name": "Ostomy Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 30
  },
  {
    "id": "964ed508-40e6-4fd9-bc9e-b172541336ac",
    "code": "task_cg_hospice_palliative_care",
    "name": "Hospice / Palliative Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 170
  },
  {
    "id": "96e794b7-dd9d-4d33-88ca-d8af8b36faa5",
    "code": "blood_glucose_monitoring",
    "name": "Blood Glucose Monitoring",
    "is_active": true,
    "is_skilled": true,
    "category_id": "21fb5ff7-d3c3-4734-ab8e-3abef46eb998",
    "description": "Fingerstick glucose check and documentation",
    "display_order": 220
  },
  {
    "id": "98ef4c67-2d3b-4bcd-ab93-3da6c3c48cd9",
    "code": "task_cg_insulin_administration",
    "name": "Insulin Administration",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 80
  },
  {
    "id": "9f401692-c7b0-49e1-b926-c42bc67dbd83",
    "code": "task_cg_bilingual_french",
    "name": "Bilingual â€” French",
    "is_active": true,
    "is_skilled": true,
    "category_id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "description": null,
    "display_order": 360
  },
  {
    "id": "a4e70a8a-2666-4695-8585-2fc57ed68fab",
    "code": "managing_communication_with_others",
    "name": "Laundry",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 160
  },
  {
    "id": "b21040a8-7f6c-424a-9f06-111373ea2e1a",
    "code": "task_cg_bilingual_portuguese",
    "name": "Bilingual â€” Portuguese",
    "is_active": true,
    "is_skilled": true,
    "category_id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "description": null,
    "display_order": 380
  },
  {
    "id": "ba28692e-79a8-43db-b1a1-1160d08cafd8",
    "code": "adl_retraining",
    "name": "ADL Retraining",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a82ffb69-ba0b-4a57-afb0-d8eac01f7d9d",
    "description": "Therapeutic ADL retraining for independence",
    "display_order": 440
  },
  {
    "id": "bbfab994-435d-4d97-b03c-b07266915f2a",
    "code": "task_cg_ms_care",
    "name": "Multiple Sclerosis Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 140
  },
  {
    "id": "bd3116e3-d1a4-4d19-8181-7a70d16f8a62",
    "code": "suctioning",
    "name": "Suctioning",
    "is_active": true,
    "is_skilled": true,
    "category_id": "e3ece539-9b01-44d6-84e7-75e2fae02b45",
    "description": "Oral or nasal suctioning per protocol",
    "display_order": 330
  },
  {
    "id": "bddc55eb-a946-43c3-9e24-10ba3f73a69b",
    "code": "task_cg_asl",
    "name": "American Sign Language (ASL)",
    "is_active": true,
    "is_skilled": true,
    "category_id": "35660ca0-0661-4187-82cf-a5eb63e4338b",
    "description": null,
    "display_order": 390
  },
  {
    "id": "bf5e25bb-6fcb-4f69-860a-76a9bef7301b",
    "code": "non_skilled_bathing_mv9tsfz0",
    "name": "Bathing",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": null,
    "display_order": 0
  },
  {
    "id": "c5a9a6a8-5cdd-4dda-9d86-eccfe3438106",
    "code": "task_cg_wound_care",
    "name": "Wound Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 10
  },
  {
    "id": "c6222579-f9a5-4aaa-8913-ec927d64e93b",
    "code": "ambulating",
    "name": "Mobility/Ambulation",
    "is_active": true,
    "is_skilled": false,
    "category_id": "2aa9747b-154e-4eb1-95ac-a7f54fabd8ce",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 10
  },
  {
    "id": "c66016ea-3410-4d02-849e-31b5c6caece9",
    "code": "task_cg_autism_spectrum_care",
    "name": "Autism Spectrum Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 210
  },
  {
    "id": "c697e136-c6de-48cb-887a-81ff89543589",
    "code": "bowel_program",
    "name": "Bowel Program",
    "is_active": true,
    "is_skilled": true,
    "category_id": "4734295e-fea1-4bc0-989f-2b78f2d5dd2f",
    "description": "Structured bowel management protocol",
    "display_order": 630
  },
  {
    "id": "c92ad9ed-f453-4e43-8e1d-c6f4e47ba2eb",
    "code": "wound_assessment",
    "name": "Wound Assessment",
    "is_active": true,
    "is_skilled": true,
    "category_id": "ba46a6a3-0b3f-4247-82d8-9980d3af49ac",
    "description": "Assess wound size, color, drainage and document",
    "display_order": 20
  },
  {
    "id": "cbd7eafb-4095-479d-8abd-1ddfd7ab02f4",
    "code": "wound_dressing_change",
    "name": "Wound Dressing Change",
    "is_active": true,
    "is_skilled": true,
    "category_id": "ba46a6a3-0b3f-4247-82d8-9980d3af49ac",
    "description": "Change and assess wound dressings per order",
    "display_order": 10
  },
  {
    "id": "cd43c3c3-9586-4c93-ad0a-440c543c261f",
    "code": "task_cg_pt_assistance",
    "name": "Physical Therapy Assistance",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a93f2ae2-d664-430c-83a4-765db809a6b4",
    "description": null,
    "display_order": 250
  },
  {
    "id": "cd8406f1-6287-47e1-bc0e-c733cce0dbdc",
    "code": "shopping",
    "name": "Grocery Shopping",
    "is_active": true,
    "is_skilled": false,
    "category_id": "033b0357-6df9-446b-9a3a-9f36e853d79c",
    "description": "Backfilled from constants ADL_LISTS",
    "display_order": 130
  },
  {
    "id": "d169d340-5d20-4a73-a2a1-f3ecc9cb9503",
    "code": "vital_signs_assessment",
    "name": "Vital Signs Assessment",
    "is_active": true,
    "is_skilled": true,
    "category_id": "21fb5ff7-d3c3-4734-ab8e-3abef46eb998",
    "description": "BP, pulse, respiration, temperature, SpO2",
    "display_order": 210
  },
  {
    "id": "d18c679c-12ea-43a8-b54c-eaf473ba26cb",
    "code": "transfer_training",
    "name": "Transfer Training",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a82ffb69-ba0b-4a57-afb0-d8eac01f7d9d",
    "description": "Safe transfer techniques from bed/chair",
    "display_order": 420
  },
  {
    "id": "d221c4ab-5a4b-410e-a123-50882847fd7c",
    "code": "tpn_management",
    "name": "TPN Management",
    "is_active": true,
    "is_skilled": true,
    "category_id": "0819bdb5-9d1d-4887-b6bc-a7bd9d0a7539",
    "description": "Total parenteral nutrition monitoring",
    "display_order": 520
  },
  {
    "id": "d3237cfe-eb53-4405-877b-5a4a09caac1d",
    "code": "chest_physiotherapy",
    "name": "Chest Physiotherapy",
    "is_active": true,
    "is_skilled": true,
    "category_id": "e3ece539-9b01-44d6-84e7-75e2fae02b45",
    "description": "Postural drainage and percussion",
    "display_order": 340
  },
  {
    "id": "d424e5e9-f10c-4054-aba0-89094a298bf0",
    "code": "task_cg_tbi_care",
    "name": "Traumatic Brain Injury Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 160
  },
  {
    "id": "d833e906-5dbc-4455-a399-20e92b7dd5d3",
    "code": "catheter_change",
    "name": "Catheter Change",
    "is_active": true,
    "is_skilled": true,
    "category_id": "4734295e-fea1-4bc0-989f-2b78f2d5dd2f",
    "description": "Foley catheter insertion/change per order",
    "display_order": 620
  },
  {
    "id": "d91733df-c360-4f0e-94f1-4578e34519a5",
    "code": "task_cg_diabetic_care",
    "name": "Diabetic Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 190
  },
  {
    "id": "dab81783-4e07-4530-ab78-bf411a0ea060",
    "code": "task_cg_catheter_care",
    "name": "Catheter Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "13793e33-2619-4be8-a9b0-af09b3dac7c5",
    "description": null,
    "display_order": 20
  },
  {
    "id": "ee828360-0334-40ec-9a54-63d3d10f0fc4",
    "code": "gait_training",
    "name": "Gait Training",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a82ffb69-ba0b-4a57-afb0-d8eac01f7d9d",
    "description": "Supervised ambulation and gait retraining",
    "display_order": 430
  },
  {
    "id": "f2bb8be4-1871-4f80-93eb-7f3ce9294b48",
    "code": "weight_monitoring",
    "name": "Weight Monitoring",
    "is_active": true,
    "is_skilled": true,
    "category_id": "21fb5ff7-d3c3-4734-ab8e-3abef46eb998",
    "description": "Daily weight and fluid balance assessment",
    "display_order": 230
  },
  {
    "id": "fc6d2282-470d-4be3-9491-dad3beed1436",
    "code": "task_cg_transfer_mobility_assistance",
    "name": "Transfer & Mobility Assistance",
    "is_active": true,
    "is_skilled": true,
    "category_id": "a93f2ae2-d664-430c-83a4-765db809a6b4",
    "description": null,
    "display_order": 230
  },
  {
    "id": "feb1460e-df21-4093-9c0a-3ed63ef57a52",
    "code": "pressure_injury_prevention",
    "name": "Pressure Injury Prevention",
    "is_active": true,
    "is_skilled": true,
    "category_id": "ba46a6a3-0b3f-4247-82d8-9980d3af49ac",
    "description": "Skin assessment and repositioning protocol",
    "display_order": 40
  },
  {
    "id": "feb87ee0-833f-46f1-b122-47a484762a8d",
    "code": "task_cg_als_care",
    "name": "ALS Care",
    "is_active": true,
    "is_skilled": true,
    "category_id": "18245d23-5ffd-4536-ade1-d6c2e38108e8",
    "description": null,
    "display_order": 150
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_task_catalog ON COMMIT DROP AS SELECT * FROM public.task_catalog;

CREATE TEMP TABLE _seed_configuration_types ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.configuration_types, $reference_seed$[
  {
    "id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "code": "CERTIFICATION_TYPE",
    "name": "Certification Type",
    "is_active": true,
    "description": "Certification types for caregiver credentials",
    "supports_hierarchy": false,
    "is_admin_manageable": true
  },
  {
    "id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "code": "STAFF_ROLE",
    "name": "Staff Role",
    "is_active": true,
    "description": "Staff roles for caregiver members",
    "supports_hierarchy": false,
    "is_admin_manageable": true
  },
  {
    "id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "code": "CAREGIVER_SKILL_CATEGORY",
    "name": "Caregiver Skill Category",
    "is_active": true,
    "description": "Categories used to organize the caregiver skill catalog.",
    "supports_hierarchy": false,
    "is_admin_manageable": true
  },
  {
    "id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "code": "PLAYBOOK_CATEGORY",
    "name": "Playbook Category",
    "is_active": true,
    "description": "Categories and subcategories used to classify playbooks, programs, and certifications.",
    "supports_hierarchy": true,
    "is_admin_manageable": true
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_configuration_types ON COMMIT DROP AS SELECT * FROM public.configuration_types;

CREATE TEMP TABLE _seed_configuration_values ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.configuration_values, $reference_seed$[
  {
    "id": "05c22963-8f55-4eb7-8bb0-6af0640832ca",
    "code": null,
    "name": "Skilled",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": "b6d6c103-8354-40d4-89a2-46af51a96fb9",
    "sort_order": 0,
    "description": null
  },
  {
    "id": "09bceb03-9bef-4dc9-b224-5a378f9a5bd8",
    "code": "daily_living",
    "name": "Daily Living",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 40,
    "description": null
  },
  {
    "id": "15f570fa-0e6d-4f39-a999-e835672b4b62",
    "code": null,
    "name": "Home Health Aide Certification",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "16501110-becd-47d7-90ff-bb246b60cc2f",
    "code": null,
    "name": "Medicaid",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 3,
    "description": null
  },
  {
    "id": "1a598f38-f341-4af3-b0f9-11ca2636808e",
    "code": null,
    "name": "TB Test Clearance",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "1c320d12-84b5-4348-b8aa-d212db90f8fb",
    "code": null,
    "name": "Registered Nurse License",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "1cc22864-b60c-4172-86f9-1122ce18614d",
    "code": "certifications",
    "name": "Certifications",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 50,
    "description": null
  },
  {
    "id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "code": "other",
    "name": "Other",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 999,
    "description": null
  },
  {
    "id": "24729fee-cc79-46b6-9023-8819fc666cbd",
    "code": null,
    "name": "Background Check Clearanceggg",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "2fe6cdbf-9cc1-45f0-8eb2-ffe3fa6ce3ef",
    "code": null,
    "name": "RN - Registered Nurse",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "38876469-006d-410e-9221-c10f91e0acc8",
    "code": null,
    "name": "Medicare",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 2,
    "description": null
  },
  {
    "id": "429ecf6c-6740-44c4-98ed-329e6200ebb1",
    "code": "language",
    "name": "Language",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 60,
    "description": null
  },
  {
    "id": "47a13abe-cb57-4aad-804a-4258c47bd309",
    "code": null,
    "name": "Accreditation",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 4,
    "description": null
  },
  {
    "id": "4e89fae6-1400-4a7e-bbb9-d7c24d866bec",
    "code": "specialty_conditions",
    "name": "Specialty Conditions",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 20,
    "description": null
  },
  {
    "id": "56d4ed0d-e7d1-423d-8177-f4cc42332150",
    "code": null,
    "name": "Non-Skilled",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": "b6d6c103-8354-40d4-89a2-46af51a96fb9",
    "sort_order": 0,
    "description": null
  },
  {
    "id": "653e000f-7250-4715-afd1-eab91b095535",
    "code": "physical_support",
    "name": "Physical Support",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 30,
    "description": null
  },
  {
    "id": "699654aa-1071-407d-aedf-5605c1f35f07",
    "code": null,
    "name": "HHA - Home Health Aide",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "6f8a779a-0da6-472b-b5ad-d0865f707ac7",
    "code": null,
    "name": "First Aid Certification",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "72bcf99b-931a-4976-b351-82468dd574a9",
    "code": null,
    "name": "222",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "78162dbc-2359-48cd-9228-663d54bf4c1d",
    "code": null,
    "name": "Other",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 7,
    "description": null
  },
  {
    "id": "7d3bc79d-c41a-44b8-9d29-bc6f5ab7410d",
    "code": null,
    "name": "Bond",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 5,
    "description": null
  },
  {
    "id": "886326b6-5a24-4d83-8cb2-9598bdcc140a",
    "code": null,
    "name": "Office Admin",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "92f96dd0-1463-464c-a92a-5d9ed82036cd",
    "code": null,
    "name": "Medication Administration Certification",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "968243ec-b285-4678-a65c-65a15d673e2e",
    "code": null,
    "name": "State License",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 1,
    "description": null
  },
  {
    "id": "9ac07531-e585-406d-bae3-5957adc6e1a9",
    "code": null,
    "name": "CPR Certification",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "a6463989-6c1e-463e-84ce-0b341cd427e9",
    "code": null,
    "name": "CNN-Home HealthCare",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "b003327b-c81d-4d3e-bdaa-c8010ee49847",
    "code": null,
    "name": "Super skilled",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": "b6d6c103-8354-40d4-89a2-46af51a96fb9",
    "sort_order": 0,
    "description": null
  },
  {
    "id": "b6d6c103-8354-40d4-89a2-46af51a96fb9",
    "code": null,
    "name": "Home Health License",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "b81eda98-33f4-43ae-aa24-88892beb6383",
    "code": null,
    "name": "LPN - Licensed Practical Nurse",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "bd31724b-0b83-407f-a4f8-6c87ff6bfa4f",
    "code": null,
    "name": "PT - Physical Therapist",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "bfdf8dbb-d5cb-4c58-beb2-058717ec7c13",
    "code": null,
    "name": "Insurance",
    "type_id": "97fb42bf-852c-4b72-a5ce-c47410946b63",
    "is_active": true,
    "parent_id": null,
    "sort_order": 6,
    "description": null
  },
  {
    "id": "c267ba09-6422-4399-8d73-58d1eb398a01",
    "code": null,
    "name": "111",
    "type_id": "2661fcac-a8b9-481a-84da-8f212b30f76c",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "ed1cf16e-9ac1-479e-a138-4118d2883d3f",
    "code": null,
    "name": "CNA - Certified Nursing Assistantsss",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "f62a45e1-b4ff-4c2c-b06b-4332f676b923",
    "code": null,
    "name": "LVN - Licensed Vocational Nurse",
    "type_id": "64b4d6cf-76c3-4685-ac91-a306161ac16a",
    "is_active": true,
    "parent_id": null,
    "sort_order": 0,
    "description": null
  },
  {
    "id": "f7b7b277-5bba-4d4b-8e5c-3dfaea36ea0b",
    "code": "clinical_care",
    "name": "Clinical Care",
    "type_id": "67aa14f1-c28a-40f7-b298-8f0055cebafb",
    "is_active": true,
    "parent_id": null,
    "sort_order": 10,
    "description": null
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_configuration_values ON COMMIT DROP AS SELECT * FROM public.configuration_values;

CREATE TEMP TABLE _seed_credential_catalog ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.credential_catalog, $reference_seed$[
  {
    "id": "006194c2-ce27-43b0-bf7b-867e17165352",
    "code": "legacy_skill_c7514a7b37f75463f0c0ff33fbc91459",
    "name": "Companionship",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "08d82522-7225-4221-b6ff-015ac4dfdfef",
    "code": "legacy_skill_dbde4039b0fe06cef8b953527dad22ed",
    "name": "Medication Reminders",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "0d9b9e5f-dfad-4258-8add-7b057ce4afd2",
    "code": "legacy_skill_0d85698b4a3d943298aa2ea8349d2352",
    "name": "Bilingual â€” Spanish",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "10980ae6-1094-464f-be6f-610fc7fcd8db",
    "code": "legacy_skill_ff8870609b9d953fe43299a13c28d55d",
    "name": "Cather Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "11182767-b79d-427d-9282-5445e8b5ae80",
    "code": "legacy_skill_df458ebcf9afcc9bb8bcd1753236fa66",
    "name": "Bilingual â€” Portuguese",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "22cd11b7-da2f-47ba-b265-64d88873ebbb",
    "code": "legacy_skill_9e332be5231894056dfb012ec250c74f",
    "name": "Insulin Administration",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "240670b9-f444-4cf3-ac44-79a69c70e24e",
    "code": "legacy_skill_883239a3328054ed07da764b8c3b13b3",
    "name": "CPR Certified",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "2ad3fd8e-e11a-4903-b9ca-bcaf3774af9a",
    "code": "legacy_skill_44388e9a2ebf9c897d762dd426b1cb47",
    "name": "Meal Preparation",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "3cd0f1ef-f8df-409d-b64d-283c605db21d",
    "code": "legacy_skill_895ced63483384d549bf12b5b8facaf5",
    "name": "Fall Prevention",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "44734547-5ca7-452b-82a2-32b68ee1c3af",
    "code": "legacy_skill_50fc9ef1bb30a932742a0772280ee1c2",
    "name": "Transfer & Mobility Assistance",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "483c3006-43d3-409e-9396-51717c6fa450",
    "code": "legacy_skill_d9f5b7abddfeb4e4d8cd98f2d4645ab6",
    "name": "Alzheimer's / Dementia Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "4c916ea2-417a-4f9a-8bc5-13a011757f68",
    "code": "legacy_skill_a60e3b35531c35242b31925cbf163af2",
    "name": "Traumatic Brain Injury Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "6197e31c-2de9-4d4c-9419-6fbb30aec29b",
    "code": "legacy_skill_9dcaa2caa74d1ee8a9991928afd1f5bc",
    "name": "Catheter Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "703e9b47-5d87-455a-9bc7-25c14a655bbf",
    "code": "legacy_skill_a31bc67009ee04ccbab13aca516811d2",
    "name": "Physical Therapy Assistance",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "864e5278-dc16-46e7-94f1-2ae0fcde24fe",
    "code": "legacy_skill_b796879ec4c9611666cfee021695b3db",
    "name": "Bilingual â€” Mandarin",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "8e3dbd56-867e-48c3-b49d-a34898fda854",
    "code": "legacy_skill_df2dc30e0e3719348ea0d63a51a92710",
    "name": "Ostomy Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "90025217-f61b-4d12-8c6b-cc7d59fd8df6",
    "code": "legacy_skill_8397edcfe7641fc9c20085a6d837ce2c",
    "name": "AED Certified",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "94777fda-1334-412c-b9fa-85a1440dbd99",
    "code": "legacy_skill_501e3a312d08cba344d69447a852b1d9",
    "name": "Multiple Sclerosis Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "aa4fd94c-655b-48ac-9031-ea55f3772545",
    "code": "legacy_skill_efd381d691e891fdeb1a1f200e7fd453",
    "name": "Feeding Tube Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "b1cb88ea-9e62-43eb-8933-d78b1639187f",
    "code": "legacy_skill_15a794660eb939c36c55e27357d7d15f",
    "name": "Housekeeping",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "bc8f1920-08f6-40b0-bfc6-49a0c169537d",
    "code": "legacy_skill_d8a057af69f370eb83030bbc575da688",
    "name": "Wound Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "bebdf840-7ed8-483b-ba6f-5fecb199ad21",
    "code": "legacy_skill_1735bcd555f92c20c38e556675145530",
    "name": "Parkinson's Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "c386a020-1f32-4796-a129-3565482e065e",
    "code": "legacy_skill_9492baf0639f6bc777cebf5843b2372a",
    "name": "Bilingual â€” French",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "c8390ba2-4540-490e-83e3-f63736f117e9",
    "code": "legacy_skill_a42ea90b62f1bf64c49c5ce3104202e4",
    "name": "Tracheostomy Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "eaf2f283-c7f2-4010-aaa5-c01f527d70b7",
    "code": "legacy_skill_8f7ef9604ccbdbe260af3c7d23bb32e2",
    "name": "First Aid Certified",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "f6046fda-1ff0-4fdc-aac0-ad9794e2b0ca",
    "code": "legacy_skill_c1ba9e122c968e09aaa6c0b0776140ef",
    "name": "Stroke Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  },
  {
    "id": "fec75138-14ac-4e28-8ab2-a384f217ca21",
    "code": "legacy_skill_ee0ad6ee30b2694086beb2cd7d1249b6",
    "name": "ALS Care",
    "scope": "system",
    "is_active": true,
    "category_id": "221d8ce5-0022-4be8-a0fe-e4d098adec94",
    "service_type": null,
    "display_order": 0,
    "credential_type": "skill"
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_credential_catalog ON COMMIT DROP AS
SELECT * FROM public.credential_catalog
WHERE scope = 'system' AND code NOT LIKE 'TEST\_%' ESCAPE '\';

CREATE TEMP TABLE _seed_task_required_credentials ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.task_required_credentials, $reference_seed$[]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_task_required_credentials ON COMMIT DROP AS
SELECT link.*
FROM public.task_required_credentials link
JOIN public.credential_catalog credential ON credential.id = link.credential_id
WHERE credential.scope = 'system' AND credential.code NOT LIKE 'TEST\_%' ESCAPE '\';

CREATE TEMP TABLE _seed_license_types ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.license_types, $reference_seed$[
  {
    "id": "401fb3ca-279f-49c1-aa53-c4962e9b2470",
    "name": "test_conne",
    "state": "Connecticut",
    "cost_max": 3000,
    "cost_min": 3000,
    "icon_type": "heart",
    "is_active": true,
    "description": "dfds",
    "service_fee": 500,
    "cost_display": "$3000",
    "requirements": [],
    "processing_time_max": 10,
    "processing_time_min": 10,
    "service_fee_display": "$500",
    "renewal_period_years": 2,
    "certification_category": "state_license",
    "renewal_period_display": "2 years",
    "processing_time_display": "10 min"
  },
  {
    "id": "8a19e5ae-7513-4f0e-abe0-f5f48a88ed25",
    "name": "Test Licensce Type",
    "state": "California",
    "cost_max": 222,
    "cost_min": 222,
    "icon_type": "heart",
    "is_active": true,
    "description": "New License",
    "service_fee": 111,
    "cost_display": "222",
    "requirements": [],
    "processing_time_max": 45,
    "processing_time_min": 45,
    "service_fee_display": "111",
    "renewal_period_years": 1,
    "certification_category": "state_license",
    "renewal_period_display": "1 Year",
    "processing_time_display": "45"
  },
  {
    "id": "b61d4386-3877-4baf-9e6c-dee2f630cec6",
    "name": "HomeHealth",
    "state": "California",
    "cost_max": 500,
    "cost_min": 500,
    "icon_type": "heart",
    "is_active": true,
    "description": "New Home health",
    "service_fee": 200,
    "cost_display": "500",
    "requirements": [],
    "processing_time_max": 60,
    "processing_time_min": 60,
    "service_fee_display": "200",
    "renewal_period_years": 1,
    "certification_category": "state_license",
    "renewal_period_display": "1",
    "processing_time_display": "60"
  },
  {
    "id": "fb30c9e4-1924-472a-a943-b18dae1bf21c",
    "name": "alaska",
    "state": "Alaska",
    "cost_max": 555,
    "cost_min": 555,
    "icon_type": "heart",
    "is_active": false,
    "description": "aaaaaa",
    "service_fee": 45,
    "cost_display": "555",
    "requirements": [],
    "processing_time_max": 55,
    "processing_time_min": 55,
    "service_fee_display": "45",
    "renewal_period_years": 1,
    "certification_category": "state_license",
    "renewal_period_display": "1",
    "processing_time_display": "55"
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_license_types ON COMMIT DROP AS SELECT * FROM public.license_types;

CREATE TEMP TABLE _seed_pricing ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.pricing, $reference_seed$[
  {
    "id": "5b7c5b07-8f78-4dd7-bb3a-cbff3c27db92",
    "staff_license": 50,
    "effective_date": "2026-02-01",
    "owner_admin_license": 100
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_pricing ON COMMIT DROP AS SELECT * FROM public.pricing;

CREATE TEMP TABLE _seed_billing_codes ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.billing_codes, $reference_seed$[
  {
    "id": "0648e22c-dbec-4409-964c-b51fd8096293",
    "code": "S5125",
    "name": "Attendant care services",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "312a8708-cfd2-4b13-a606-a09404647b0e",
    "code": "G0156",
    "name": "Services of home health/hospice aide",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "4280e03a-a2e6-4356-9fa5-bbabc8ac3563",
    "code": "S5126",
    "name": "Attendant care services (per diem)",
    "rate": null,
    "is_active": true,
    "unit_type": "visit"
  },
  {
    "id": "50f20af7-3888-4abc-b0b4-e0004a4ffebf",
    "code": "W1726",
    "name": "State-specific attendant/personal care code",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "6388a92f-5bc1-44a8-a8b3-014dfb838015",
    "code": "T1019",
    "name": "Personal care services, per 15 minutes",
    "rate": null,
    "is_active": true,
    "unit_type": "15_min_unit"
  },
  {
    "id": "89d4b8c1-7b62-4254-8276-b462f24e742c",
    "code": "97110",
    "name": "Therapeutic exercises",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "96089586-34ae-434a-8bc2-49a2ee771b7f",
    "code": "G0159",
    "name": "Occupational therapy in home health setting",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "9bbd8b8c-5688-40dc-b931-3948416058cb",
    "code": "97530",
    "name": "Therapeutic activities",
    "rate": null,
    "is_active": true,
    "unit_type": "hour"
  },
  {
    "id": "a27934a9-936c-49f9-b731-8cbb3b0aa7d1",
    "code": "T1020",
    "name": "Personal care services, per diem",
    "rate": null,
    "is_active": true,
    "unit_type": "visit"
  },
  {
    "id": "df2be01d-413e-408e-95c0-c319b87db538",
    "code": "99509",
    "name": "Home visit for assistance with activities of daily living",
    "rate": null,
    "is_active": true,
    "unit_type": "visit"
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_billing_codes ON COMMIT DROP AS SELECT * FROM public.billing_codes;

CREATE TEMP TABLE _seed_validation_rules ON COMMIT DROP AS
SELECT * FROM jsonb_populate_recordset(NULL::public.validation_rules, $reference_seed$[
  {
    "id": "0e3df793-396b-4210-a2eb-a4f28eb9f60a",
    "name": "Office Address",
    "field_key": "office_address",
    "is_active": true,
    "sort_order": 3,
    "description": "Verify the licensed office address on the document matches the agency record."
  },
  {
    "id": "1761c49c-cbea-4909-b9ac-44f73d6160d1",
    "name": "DBA / Operating Name",
    "field_key": "agency_name",
    "is_active": true,
    "sort_order": 2,
    "description": "Verify the operating or DBA name matches the agency record."
  },
  {
    "id": "3df27c41-43a3-4a8f-90c0-82ce84461665",
    "name": "Legal Entity Name",
    "field_key": "legal_entity_name",
    "is_active": true,
    "sort_order": 1,
    "description": "Verify the legal entity name on the document matches the agency record."
  },
  {
    "id": "3e4a3ff5-e01b-4239-b777-18a3b3d1828a",
    "name": "Mailing Address",
    "field_key": "mailing_address",
    "is_active": true,
    "sort_order": 6,
    "description": "Verify the mailing address on the document matches the agency record."
  },
  {
    "id": "b0c9bb93-5e52-4603-a2a9-e6615c35e794",
    "name": "State of Operation",
    "field_key": "state",
    "is_active": true,
    "sort_order": 4,
    "description": "Verify the state listed on the document matches the agency's licensed state."
  },
  {
    "id": "d2dc7cb3-b31e-42f6-9e85-55cc11469512",
    "name": "Corporate Address",
    "field_key": "corporate_address",
    "is_active": true,
    "sort_order": 5,
    "description": "Verify the corporate / principal place of business address matches the agency record."
  }
]$reference_seed$::jsonb);
CREATE TEMP TABLE _current_validation_rules ON COMMIT DROP AS SELECT * FROM public.validation_rules;

DO $validate_source$
DECLARE
  item record;
  current_count bigint;
  has_drift boolean;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('task_categories', ARRAY['created_at','updated_at']::text[]),
    ('task_catalog', ARRAY['created_at','updated_at']::text[]),
    ('configuration_types', ARRAY['created_at','updated_at']::text[]),
    ('configuration_values', ARRAY['created_at','updated_at','created_by']::text[]),
    ('credential_catalog', ARRAY['created_at','updated_at','agency_id','created_by_user_id']::text[]),
    ('task_required_credentials', ARRAY['created_at','updated_at']::text[]),
    ('license_types', ARRAY['created_at','updated_at']::text[]),
    ('pricing', ARRAY['created_at']::text[]),
    ('billing_codes', ARRAY['created_at','updated_at']::text[]),
    ('validation_rules', ARRAY['created_at','updated_at']::text[])
  ) AS expected(table_name, ignored_columns)
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', '_current_' || item.table_name) INTO current_count;
    IF current_count > 0 THEN
      EXECUTE format(
        'SELECT EXISTS (
           SELECT 1 FROM (
             (SELECT to_jsonb(seed_row) - $1 AS value FROM %1$I seed_row
              EXCEPT SELECT to_jsonb(current_row) - $1 FROM %2$I current_row)
             UNION ALL
             (SELECT to_jsonb(current_row) - $1 FROM %2$I current_row
              EXCEPT SELECT to_jsonb(seed_row) - $1 FROM %1$I seed_row)
           ) drift
         )',
        '_seed_' || item.table_name,
        '_current_' || item.table_name
      ) USING item.ignored_columns INTO has_drift;
      IF has_drift THEN
        RAISE EXCEPTION '037 found non-empty, non-canonical rows in public.%; no rows changed', item.table_name;
      END IF;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM _seed_task_categories) <> 15
     OR (SELECT count(*) FROM _seed_task_catalog) <> 80
     OR (SELECT count(*) FROM _seed_configuration_types) <> 4
     OR (SELECT count(*) FROM _seed_configuration_values) <> 35
     OR (SELECT count(*) FROM _seed_credential_catalog) <> 27
     OR (SELECT count(*) FROM _seed_task_required_credentials) <> 0
     OR (SELECT count(*) FROM _seed_license_types) <> 4
     OR (SELECT count(*) FROM _seed_pricing) <> 1
     OR (SELECT count(*) FROM _seed_billing_codes) <> 10
     OR (SELECT count(*) FROM _seed_validation_rules) <> 6 THEN
    RAISE EXCEPTION '037 embedded reference baseline has unexpected row counts';
  END IF;

  IF EXISTS (SELECT 1 FROM _seed_credential_catalog WHERE scope <> 'system' OR code LIKE 'TEST\_%' ESCAPE '\')
     OR EXISTS (
       SELECT 1 FROM _seed_task_catalog task
       LEFT JOIN _seed_task_categories category ON category.id = task.category_id
       WHERE category.id IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM _seed_configuration_values value
       LEFT JOIN _seed_configuration_types type ON type.id = value.type_id
       WHERE type.id IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM _seed_configuration_values value
       LEFT JOIN _seed_configuration_values parent ON parent.id = value.parent_id
       WHERE value.parent_id IS NOT NULL AND parent.id IS NULL
     )
     OR EXISTS (
       SELECT 1 FROM _seed_credential_catalog credential
       LEFT JOIN _seed_configuration_values category ON category.id = credential.category_id
       WHERE credential.category_id IS NOT NULL AND category.id IS NULL
     ) THEN
    RAISE EXCEPTION '037 embedded reference baseline failed scope or foreign-key validation';
  END IF;
END
$validate_source$;

CREATE TEMP TABLE _reference_seed_changes(row_count bigint) ON COMMIT DROP;

WITH inserted AS (
  INSERT INTO public.task_categories (id, name, service_type, display_order)
  SELECT id, name, service_type, display_order FROM _seed_task_categories
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.task_catalog (id, code, name, description, category_id, is_skilled, is_active, display_order)
  SELECT id, code, name, description, category_id, is_skilled, is_active, display_order FROM _seed_task_catalog
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.configuration_types (id, code, name, description, supports_hierarchy, is_admin_manageable, is_active)
  SELECT id, code, name, description, supports_hierarchy, is_admin_manageable, is_active FROM _seed_configuration_types
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.configuration_values (id, type_id, parent_id, code, name, description, is_active, sort_order)
  SELECT id, type_id, parent_id, code, name, description, is_active, sort_order FROM _seed_configuration_values
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.credential_catalog (
    id, code, name, credential_type, service_type, is_active, display_order, scope, category_id
  )
  SELECT id, code, name, credential_type, service_type, is_active, display_order, scope, category_id
  FROM _seed_credential_catalog
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.task_required_credentials
  SELECT * FROM _seed_task_required_credentials
  ON CONFLICT DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.license_types (
    id, state, name, description, cost_min, cost_max, cost_display,
    processing_time_min, processing_time_max, processing_time_display,
    renewal_period_years, renewal_period_display, icon_type, requirements,
    is_active, service_fee, service_fee_display, certification_category
  )
  SELECT id, state, name, description, cost_min, cost_max, cost_display,
    processing_time_min, processing_time_max, processing_time_display,
    renewal_period_years, renewal_period_display, icon_type, requirements,
    is_active, service_fee, service_fee_display, certification_category
  FROM _seed_license_types
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.pricing (id, owner_admin_license, staff_license, effective_date)
  SELECT id, owner_admin_license, staff_license, effective_date FROM _seed_pricing
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.billing_codes (id, code, name, unit_type, rate, is_active)
  SELECT id, code, name, unit_type, rate, is_active FROM _seed_billing_codes
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

WITH inserted AS (
  INSERT INTO public.validation_rules (id, name, description, field_key, is_active, sort_order)
  SELECT id, name, description, field_key, is_active, sort_order FROM _seed_validation_rules
  ON CONFLICT (id) DO NOTHING RETURNING 1
)
INSERT INTO _reference_seed_changes SELECT count(*) FROM inserted;

INSERT INTO public.audit_log (agency_id, table_name, record_id, action, performed_by_user_id, details)
SELECT NULL, 'reference_data', NULL, 'SEED_REFERENCE_DATA', NULL,
  jsonb_build_object(
    'source', 'migration_037_reviewed_uat_reference_baseline',
    'changed_row_count', sum(row_count)
  )
FROM _reference_seed_changes
HAVING sum(row_count) > 0;

DO $postflight$
BEGIN
  IF (SELECT count(*) FROM public.task_categories) <> 15
     OR (SELECT count(*) FROM public.task_catalog) <> 80
     OR (SELECT count(*) FROM public.configuration_types) <> 4
     OR (SELECT count(*) FROM public.configuration_values) <> 35
     OR (
       SELECT count(*) FROM public.credential_catalog
       WHERE scope = 'system' AND code NOT LIKE 'TEST\_%' ESCAPE '\'
     ) <> 27
     OR (SELECT count(*) FROM public.license_types) <> 4
     OR (SELECT count(*) FROM public.pricing) <> 1
     OR (SELECT count(*) FROM public.billing_codes) <> 10
     OR (SELECT count(*) FROM public.validation_rules) <> 6 THEN
    RAISE EXCEPTION '037 postflight reference counts do not match the reviewed baseline';
  END IF;
END
$postflight$;

COMMIT;
