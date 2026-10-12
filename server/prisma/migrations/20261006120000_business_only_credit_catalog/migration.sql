UPDATE credit_products
SET status = 'inactive'
WHERE category <> 'business';

UPDATE partners
SET status = 'inactive'
WHERE code IN ('TIBAPAY_UG', 'SILIFI_UG');
