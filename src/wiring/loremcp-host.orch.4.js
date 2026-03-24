/** @implements FR-001, FR-003 — Host adapter over the Lore MCP runtime instance shape. */
function createLoreMcpInstanceHost(instance) {
	return {
		db: instance.env.DB,
		env: instance.env,
		getServer: () => instance.server,
		setServer: (server) => {
			instance.server = server;
		},
		processIngestion: (...args) => instance.processIngestion(...args),
		schedule: (when, label) => instance.schedule(when, label),
	};
}

export { createLoreMcpInstanceHost };
