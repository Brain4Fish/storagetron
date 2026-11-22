ALTER TABLE documentation_reports
    DROP CONSTRAINT documentation_reports_format_check;

ALTER TABLE documentation_reports
    ADD CONSTRAINT documentation_reports_format_check
    CHECK (format IN ('xlsx', 'pdf', 'docx'));
