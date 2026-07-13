DROP TABLE IF EXISTS question_log CASCADE;
DROP TABLE IF EXISTS resource CASCADE;
DROP TABLE IF EXISTS promo_override CASCADE;
DROP TABLE IF EXISTS package_override CASCADE;
DROP TABLE IF EXISTS promo CASCADE;
DROP TABLE IF EXISTS package CASCADE;
DROP TABLE IF EXISTS size_tier CASCADE;
DROP TABLE IF EXISTS location CASCADE;
DROP TABLE IF EXISTS company CASCADE;

CREATE TABLE company (
    id integer PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE location (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    name text NOT NULL,
    city text NOT NULL
);

CREATE TABLE size_tier (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    name text NOT NULL,
    min_guests integer NOT NULL,
    max_guests integer NOT NULL
);

CREATE TABLE package (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    name text NOT NULL,
    description text NOT NULL,
    base_price_cents integer NOT NULL,
    size_tier_id integer NOT NULL REFERENCES size_tier (id),
    active boolean NOT NULL
);

CREATE TABLE package_override (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    location_id integer NOT NULL REFERENCES location (id),
    package_id integer NOT NULL REFERENCES package (id),
    price_cents integer,
    available boolean NOT NULL,
    UNIQUE (location_id, package_id)
);

CREATE TABLE promo (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    code text NOT NULL,
    description text NOT NULL,
    discount_percent integer NOT NULL,
    starts_on date NOT NULL,
    ends_on date NOT NULL,
    active boolean NOT NULL
);

CREATE TABLE promo_override (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    location_id integer NOT NULL REFERENCES location (id),
    promo_id integer NOT NULL REFERENCES promo (id),
    discount_percent integer,
    active boolean NOT NULL,
    UNIQUE (location_id, promo_id)
);

CREATE TABLE resource (
    id integer PRIMARY KEY,
    company_id integer NOT NULL REFERENCES company (id),
    location_id integer NOT NULL REFERENCES location (id),
    name text NOT NULL,
    capacity integer NOT NULL,
    size_tier_id integer NOT NULL REFERENCES size_tier (id)
);

CREATE TABLE question_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_id integer NOT NULL REFERENCES location (id),
    question text NOT NULL,
    answer text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
