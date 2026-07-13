INSERT INTO company (id, name) VALUES
    (1, 'Acme Play'),
    (2, 'Rival Fun');

INSERT INTO location (id, company_id, name, city) VALUES
    (10, 1, 'Downtown', 'Portland'),
    (11, 1, 'Uptown', 'Seattle'),
    (12, 1, 'Airport', 'Denver'),
    (13, 1, 'San Francisco', 'San Francisco'),
    (20, 2, 'Riverside', 'Austin');

INSERT INTO size_tier (id, company_id, name, min_guests, max_guests) VALUES
    (100, 1, 'Small', 1, 8),
    (101, 1, 'Large', 9, 30),
    (200, 2, 'Standard', 1, 20);

INSERT INTO package
    (id, company_id, name, description, base_price_cents, size_tier_id, active)
VALUES
    (1000, 1, 'Bronze', 'Bronze party package', 15000, 100, true),
    (1001, 1, 'Gold', 'Gold party package', 30000, 101, true),
    (1002, 1, 'Legacy', 'Retired package', 9000, 100, false),
    (1003, 1, 'Ultimate Combo', 'Ultimate party combo', 45000, 101, true),
    (2000, 2, 'Rival Basic', 'Competitor package', 5000, 200, true);

INSERT INTO package_override
    (id, company_id, location_id, package_id, price_cents, available)
VALUES
    (5000, 1, 10, 1000, 12000, true),
    (5001, 1, 10, 1001, NULL, false),
    (5002, 1, 13, 1003, NULL, false);

INSERT INTO promo
    (id, company_id, code, description, discount_percent, starts_on, ends_on, active)
VALUES
    (3000, 1, 'SAVE10', 'Ten percent off', 10, DATE '2026-01-01', DATE '2026-12-31',
     true),
    (3001, 1, 'SUMMER', 'Summer discount', 20, DATE '2026-06-01', DATE '2026-08-31',
     true),
    (3002, 1, 'OLDIE', 'Expired promo', 50, DATE '2020-01-01', DATE '2020-02-01',
     true),
    (4000, 2, 'RIVAL', 'Competitor promo', 5, DATE '2026-01-01', DATE '2026-12-31',
     true);

INSERT INTO promo_override
    (id, company_id, location_id, promo_id, discount_percent, active)
VALUES
    (6000, 1, 10, 3000, 15, true),
    (6001, 1, 10, 3001, NULL, false);

INSERT INTO resource
    (id, company_id, location_id, name, capacity, size_tier_id)
VALUES
    (7000, 1, 10, 'Room A', 8, 100),
    (7001, 1, 10, 'Room B', 20, 101),
    (7002, 1, 11, 'Room C', 12, 101),
    (7003, 1, 13, 'Bay Room', 24, 101),
    (8000, 2, 20, 'Rival Room', 10, 200);
