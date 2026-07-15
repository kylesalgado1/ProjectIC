-- seed.sql

INSERT INTO company (
    id,
    name
)
VALUES
(
    'northstar',
    'Northstar Entertainment Group'
);

INSERT INTO location (
    id,
    company_id,
    name,
    city,
    region
)
VALUES
(
    'sf',
    'northstar',
    'Round1 Stonestown Galleria',
    'San Francisco',
    'CA'
),
(
    'roseville',
    'northstar',
    'Round1 Roseville Galleria',
    'Roseville',
    'CA'
),
(
    'concord',
    'northstar',
    'Round1 Sunvalley Mall',
    'Concord',
    'CA'
);

INSERT INTO party_package (
    id,
    company_id,
    location_id,
    name,
    description,
    min_guests,
    weekday_2hr_price_cents,
    weekday_3hr_price_cents,
    weekend_2hr_price_cents,
    weekend_3hr_price_cents,
    active,
    popular
)
VALUES
(
    'sf-pkg0',
    'northstar',
    'sf',
    'All Inclusive Party',
    'Maximize fun and minimize cost! Experience the most of what we have to offer. We have plenty of options for everyone!',
    10,
    4064,
    4564,
    4964,
    5464,
    true,
    true
),
(
    'sf-pkg1',
    'northstar',
    'sf',
    'Bowling Party',
    'Strike up the fun! Spend a couple hours on the lanes and get in some good old friendly competition to see who can come out on top!',
    6,
    2799,
    3099,
    3199,
    3599,
    true,
    false
),
(
    'sf-pkg2',
    'northstar',
    'sf',
    'Arcade Party',
    'Get your game on! Try your luck on our various claw machines or play your heart out on racing, dancing, PCB games, and more. You can win it all!',
    6,
    2799,
    3199,
    3099,
    3499,
    true,
    false
),
(
    'roseville-pkg0',
    'northstar',
    'roseville',
    'All Inclusive Party',
    'Maximize fun and minimize cost! Experience the most of what we have to offer. We have plenty of options for everyone!',
    10,
    4064,
    4564,
    4964,
    5464,
    true,
    true
),
(
    'roseville-pkg1',
    'northstar',
    'roseville',
    'Bowling Party',
    'Strike up the fun! Spend a couple hours on the lanes and get in some good old friendly competition to see who can come out on top!',
    6,
    2799,
    3099,
    3199,
    3599,
    true,
    false
),
(
    'roseville-pkg2',
    'northstar',
    'roseville',
    'Arcade Party',
    'Get your game on! Try your luck on our various claw machines or play your heart out on racing, dancing, PCB games, and more. You can win it all!',
    6,
    2799,
    3199,
    3099,
    3499,
    true,
    false
),
(
    'concord-pkg0',
    'northstar',
    'concord',
    'All Inclusive Party',
    'Maximize fun and minimize cost! Experience the most of what we have to offer. We have plenty of options for everyone!',
    10,
    4064,
    4564,
    4964,
    5464,
    true,
    true
),
(
    'concord-pkg1',
    'northstar',
    'concord',
    'Bowling Party',
    'Strike up the fun! Spend a couple hours on the lanes and get in some good old friendly competition to see who can come out on top!',
    6,
    2799,
    3099,
    3199,
    3599,
    true,
    false
),
(
    'concord-pkg2',
    'northstar',
    'concord',
    'Arcade Party',
    'Get your game on! Try your luck on our various claw machines or play your heart out on racing, dancing, PCB games, and more. You can win it all!',
    6,
    2799,
    3199,
    3099,
    3499,
    true,
    false
);

INSERT INTO promo (
    id,
    company_id,
    location_id,
    name,
    description,
    starts_on,
    ends_on,
    active
)
VALUES
(
    'sf-mymelody',
    'northstar',
    'sf',
    'My Melody Takeover',
    'Limited My Melody prize machines, photo spot & plush claw prizes.',
    '2026-06-01',
    '2026-08-31',
    true
),
(
    'sf-miku',
    'northstar',
    'sf',
    'Hatsune Miku Rhythm Fest',
    'Exclusive Project DIVA rhythm cabinets & tour merch.',
    '2026-07-01',
    '2026-09-30',
    true
),
(
    'sf-cinnamoroll',
    'northstar',
    'sf',
    'Cinnamoroll Winter Cafe',
    'Cinnamoroll claw machines, café treats & winter prizes.',
    '2026-11-15',
    '2026-12-31',
    false
),
(
    'roseville-mymelody',
    'northstar',
    'roseville',
    'My Melody Takeover',
    'Limited My Melody prize machines, photo spot & plush claw prizes.',
    '2026-06-01',
    '2026-08-31',
    true
),
(
    'roseville-miku',
    'northstar',
    'roseville',
    'Hatsune Miku Rhythm Fest',
    'Exclusive Project DIVA rhythm cabinets & tour merch.',
    '2026-07-01',
    '2026-09-30',
    false
),
(
    'concord-mymelody',
    'northstar',
    'concord',
    'My Melody Takeover',
    'Limited My Melody prize machines, photo spot & plush claw prizes.',
    '2026-06-01',
    '2026-08-31',
    true
),
(
    'concord-cinnamoroll',
    'northstar',
    'concord',
    'Cinnamoroll Winter Cafe',
    'Cinnamoroll claw machines, café treats & winter prizes.',
    '2026-11-15',
    '2026-12-31',
    true
);

INSERT INTO room (
    id,
    company_id,
    location_id,
    name,
    capacity,
    quantity,
    working
)
VALUES
(
    'sf-large',
    'northstar',
    'sf',
    'Extra Large Room 1',
    40,
    2,
    true
),
(
    'sf-party',
    'northstar',
    'sf',
    'Extra Large Room 2',
    40,
    3,
    true
),
(
    'sf-vip',
    'northstar',
    'sf',
    'Large Room',
    30,
    1,
    false
),
(
    'roseville-large',
    'northstar',
    'roseville',
    'Large Room',
    50,
    2,
    true
),
(
    'roseville-lane',
    'northstar',
    'roseville',
    'Lane Suite',
    12,
    4,
    true
),
(
    'concord-large',
    'northstar',
    'concord',
    'Large Room',
    35,
    1,
    true
),
(
    'concord-party',
    'northstar',
    'concord',
    'Party Room',
    14,
    2,
    true
);

INSERT INTO room_reservation (
    id,
    company_id,
    location_id,
    room_id,
    starts_at,
    ends_at
)
VALUES
(
    'sf-large-r1',
    'northstar',
    'sf',
    'sf-large',
    '2026-07-18 15:00:00',
    '2026-07-18 17:00:00'
),
(
    'sf-large-r2',
    'northstar',
    'sf',
    'sf-large',
    '2026-07-18 18:00:00',
    '2026-07-18 20:00:00'
);
