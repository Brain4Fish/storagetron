CREATE TABLE documentation_reports (
    id UUID PRIMARY KEY,
    filename TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('xlsx', 'pdf')),
    language TEXT NOT NULL DEFAULT 'ru',
    scope_type TEXT NOT NULL CHECK (scope_type IN ('location', 'containers')),
    scope_snapshot JSONB NOT NULL,
    request_snapshot JSONB NOT NULL,
    transport_order_number TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_documentation_reports_created_at
    ON documentation_reports (created_at DESC);
