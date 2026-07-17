-- Drop two more confirmed-dead tables: products, stock_log.
--
-- Left deliberately untouched in migration 054 (device_login_events,
-- stock_movements) pending a product decision, since both had real rows
-- and dropping real data isn't a code-cleanup call to make unilaterally.
--
-- Investigated properly this session before acting:
--   - Neither table has a salon_id column -- both predate the
--     multi-tenant migration entirely (single-tenant Kimms era).
--   - Neither appears in db.js's TENANT_TABLES set -- the app's data
--     layer doesn't recognize either as a live tenant-scoped table.
--   - Zero references to stock_log anywhere in src/. The only "products"
--     string matches in src/ are an unrelated UI filter label in
--     CheckoutView.jsx (toggling sale-line-item type), not the table.
--   - Row content confirmed to be pre-multi-tenant test/seed data, not
--     real business records: products is a generic 10-item salon retail
--     catalog (Shampoo, Conditioner, etc.) with sequential IDs; stock_log
--     is 20 rows entirely written within an 18-minute window on
--     2026-06-14, all reason='ADJUSTMENT', all user_role='admin', all
--     transaction_id=null, several against product_name='Test' with a
--     product_id that was never in `products` -- manual UI click-testing,
--     not a real inventory trail.
--
-- Both exported to CSV before this ran (products_archive_2026-07-17.csv,
-- stock_log_archive_2026-07-17.csv). DROP TABLE succeeded without
-- CASCADE for either, confirming no live dependents -- same pattern as
-- migration 054.

DROP TABLE products;
DROP TABLE stock_log;
