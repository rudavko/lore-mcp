-- Unique entity names (stored as provided; application resolves case via aliases)
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_entities_name
  ON canonical_entities(name);

-- Unique aliases (always stored lowercase by application)
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_aliases_alias
  ON entity_aliases(alias);
