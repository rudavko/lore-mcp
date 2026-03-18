-- Add explicit valid_to semantics to distinguish unspecified vs infinite vs bounded.
ALTER TABLE entries ADD COLUMN valid_to_state TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE triples ADD COLUMN valid_to_state TEXT NOT NULL DEFAULT 'unspecified';

-- Existing rows with concrete valid_to are bounded.
UPDATE entries SET valid_to_state = 'bounded' WHERE valid_to IS NOT NULL;
UPDATE triples SET valid_to_state = 'bounded' WHERE valid_to IS NOT NULL;
