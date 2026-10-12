UPDATE credit_products
SET min_term_days = 30
WHERE code = 'UG_BUSINESS_GROWTH'
  AND category = 'business'
  AND status = 'active';
