-- schema.sql

DROP TABLE IF EXISTS question_log CASCADE;
DROP TABLE IF EXISTS room_reservation CASCADE;
DROP TABLE IF EXISTS room CASCADE;
DROP TABLE IF EXISTS promo CASCADE;
DROP TABLE IF EXISTS party_package CASCADE;
DROP TABLE IF EXISTS location CASCADE;
DROP TABLE IF EXISTS company CASCADE;

CREATE TABLE company (
    id text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE location (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES company (id),
    name text NOT NULL,
    city text NOT NULL,
    region text NOT NULL
);

CREATE TABLE party_package (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES company (id),
    location_id text NOT NULL REFERENCES location (id),
    name text NOT NULL,
    description text NOT NULL,
    min_guests integer NOT NULL,
    weekday_2hr_price_cents integer NOT NULL,
    weekday_3hr_price_cents integer NOT NULL,
    weekend_2hr_price_cents integer NOT NULL,
    weekend_3hr_price_cents integer NOT NULL,
    active boolean NOT NULL,
    popular boolean NOT NULL DEFAULT false
);

CREATE TABLE promo (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES company (id),
    location_id text NOT NULL REFERENCES location (id),
    name text NOT NULL,
    description text NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    active boolean NOT NULL
);

CREATE TABLE room (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES company (id),
    location_id text NOT NULL REFERENCES location (id),
    name text NOT NULL,
    capacity integer NOT NULL,
    quantity integer NOT NULL,
    working boolean NOT NULL
);

CREATE TABLE room_reservation (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES company (id),
    location_id text NOT NULL REFERENCES location (id),
    room_id text NOT NULL REFERENCES room (id),
    starts_at timestamp NOT NULL,
    ends_at timestamp NOT NULL
);

CREATE TABLE question_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id text NOT NULL REFERENCES location (id),
    question text NOT NULL,
    answer text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
