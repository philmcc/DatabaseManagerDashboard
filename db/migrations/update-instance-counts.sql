-- Update instance counts for existing normalized queries
UPDATE normalized_queries
SET instance_count = (
  SELECT COUNT(*)
  FROM collected_queries
  WHERE normalized_query_id = normalized_queries.id
);

-- Verify the trigger is in place
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_trigger 
    WHERE tgname = 'maintain_distinct_query_count'
  ) THEN
    CREATE TRIGGER maintain_distinct_query_count
    AFTER INSERT OR UPDATE OR DELETE ON collected_queries
    FOR EACH ROW
    EXECUTE FUNCTION update_distinct_query_count();
  END IF;
END $$; 