/** @implements FR-001, FR-003 — Runtime service assembly over stable named dependency builders. */
import { APP_VERSION as APP_VERSION_FALLBACK } from "./config.pure.js";
import { makeInitLoreMcp, makeProcessLoreIngestion } from "./wiring/loremcp.efct.js";
import { makeConfigureLoreServer, makeRunLoreIngestion } from "./wiring/runtime.orch.1.js";
import { createRuntimeStd, resolveRuntimeAppVersion } from "./index-runtime-std.orch.3.js";
import { createConfigureLoreServerDeps } from "./index-runtime-configure-deps.orch.3.js";
import {
	createInitLoreMcpDeps,
	createProcessLoreIngestionDeps,
} from "./index-runtime-init-deps.orch.3.js";
import { createRunLoreIngestionDeps } from "./index-runtime-ingestion-deps.orch.3.js";
import packageJson from "../package.json";

function createRuntimeServices(runtimeGlobal) {
	const std = createRuntimeStd(runtimeGlobal);
	const appVersion = resolveRuntimeAppVersion(packageJson.version, APP_VERSION_FALLBACK);
	const configureLoreServer = makeConfigureLoreServer(
		createConfigureLoreServerDeps({
			appVersion,
			runtimeGlobal,
			std,
		}),
	);
	const runIngestion = makeRunLoreIngestion(
		createRunLoreIngestionDeps({
			std,
		}),
	);
	const initLoreMcp = makeInitLoreMcp(
		createInitLoreMcpDeps({
			appVersion,
			configureLoreServer,
			std,
		}),
	);
	const processLoreIngestion = makeProcessLoreIngestion(
		createProcessLoreIngestionDeps(runIngestion),
	);
	return { appVersion, configureLoreServer, initLoreMcp, processLoreIngestion, runIngestion, std };
}

export { createRuntimeServices };
