CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS locations (
                                         id UUID PRIMARY KEY,
                                         name TEXT NOT NULL,
                                         created_at TIMESTAMP DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS items (
                                     id UUID PRIMARY KEY,
                                     name TEXT NOT NULL,
                                     description TEXT,
                                     location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS containers (
                                          id UUID PRIMARY KEY,
                                          name TEXT NOT NULL,
                                          description TEXT,
                                          location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS item_container (
                                              item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    container_id UUID REFERENCES containers(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, container_id)
    );

CREATE TABLE IF NOT EXISTS photos (
                                      id UUID PRIMARY KEY,
                                      item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    content_type TEXT,
    created_at TIMESTAMP DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS labels (
                                      code TEXT PRIMARY KEY,
                                      item_id UUID REFERENCES items(id) ON DELETE CASCADE,
    container_id UUID REFERENCES containers(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT now(),
    CONSTRAINT one_target CHECK (
(item_id IS NOT NULL AND container_id IS NULL)
    OR (item_id IS NULL AND container_id IS NOT NULL)
    )
    );

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
CREATE INDEX IF NOT EXISTS idx_containers_name ON containers(name);
CREATE INDEX IF NOT EXISTS idx_photos_item ON photos(item_id);
CREATE INDEX IF NOT EXISTS idx_labels_item ON labels(item_id);
CREATE INDEX IF NOT EXISTS idx_labels_container ON labels(container_id);
