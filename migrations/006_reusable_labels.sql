ALTER TABLE labels RENAME TO scan_labels;

ALTER INDEX idx_labels_item RENAME TO idx_scan_labels_item;
ALTER INDEX idx_labels_container RENAME TO idx_scan_labels_container;

CREATE TABLE labels (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT labels_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 64),
    CONSTRAINT labels_color CHECK (color IN ('gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'))
);

CREATE UNIQUE INDEX idx_labels_name_ci ON labels (lower(name));

CREATE TABLE item_labels (
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, label_id)
);

CREATE INDEX idx_item_labels_label ON item_labels(label_id);

CREATE TABLE container_labels (
    container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (container_id, label_id)
);

CREATE INDEX idx_container_labels_label ON container_labels(label_id);
