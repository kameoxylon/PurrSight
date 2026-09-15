/**
 * Where the FGS reference photographs come from.
 * ---------------------------------------------------------------------------
 * These images are © Université de Montréal. They are NOT in this repo and must
 * not be committed to it — this repo is public. The harness therefore resolves
 * them at run time from one of two places:
 *
 *   1. FGS_REFERENCE_DIR      — a local folder. Fastest, works offline, and
 *                               stays the default so nothing here can break an
 *                               existing setup.
 *   2. FGS_REFERENCE_ACCOUNT  — a PRIVATE Azure blob container, synced into
 *                               eval/.cache/ (git-ignored) on first use.
 *
 * Option 2 exists so the probe is reproducible by more than one machine: the
 * findings in eval/README.md were previously only re-runnable by whoever had
 * the folder on their own disk.
 *
 * Auth is Entra-only — the storage account has shared-key access disabled, so
 * there is no connection string or SAS token to leak. `az login` satisfies
 * DefaultAzureCredential locally, and a managed identity does in CI. The caller
 * needs the "Storage Blob Data Reader" role on the container.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_CONTAINER = 'fgs-reference';

export interface FgsSource {
  dir: string;
  /** Human-readable provenance, for the run header. */
  origin: string;
}

/**
 * Resolves the reference directory, downloading from blob storage if that is
 * the configured source. Returns null when no source is configured at all,
 * which is not an error — the probe is optional.
 */
export async function resolveFgsSource(cacheRoot: string): Promise<FgsSource | null> {
  const localDir = process.env.FGS_REFERENCE_DIR;
  const account = process.env.FGS_REFERENCE_ACCOUNT;

  // Local wins when both are set: it needs no network and no Azure login, and
  // silently preferring the remote copy would make a stale cache invisible.
  if (localDir) {
    if (!existsSync(localDir)) {
      throw new Error(`FGS_REFERENCE_DIR is set but does not exist: ${localDir}`);
    }
    return { dir: localDir, origin: `local folder ${localDir}` };
  }

  if (!account) return null;

  const container = process.env.FGS_REFERENCE_CONTAINER ?? DEFAULT_CONTAINER;
  const dir = join(cacheRoot, 'fgs');
  mkdirSync(dir, { recursive: true });

  const downloaded = await syncContainer(account, container, dir);
  return {
    dir,
    origin: `private blob ${account}/${container} (${downloaded} downloaded, cached in eval/.cache/fgs)`,
  };
}

async function syncContainer(account: string, container: string, dir: string): Promise<number> {
  // Imported lazily so the harness still runs for the generated corpus alone
  // on a machine that has never installed the Azure SDK.
  const { BlobServiceClient } = await import('@azure/storage-blob');
  const { DefaultAzureCredential } = await import('@azure/identity');

  const service = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    new DefaultAzureCredential(),
  );
  const client = service.getContainerClient(container);

  let downloaded = 0;
  try {
    for await (const blob of client.listBlobsFlat()) {
      const target = join(dir, blob.name);
      const size = blob.properties.contentLength;

      // Size match is enough here: these are immutable published reference
      // images, not something that changes in place. Re-downloading 3.5 MB on
      // every run would just make the probe slower for no benefit.
      if (existsSync(target) && size !== undefined && statSync(target).size === size) continue;

      await client.getBlobClient(blob.name).downloadToFile(target);
      downloaded++;
    }
  } catch (err) {
    throw new Error(
      `Could not read private container "${container}" on account "${account}".\n` +
        `  - run \`az login\` (DefaultAzureCredential needs a signed-in identity)\n` +
        `  - confirm you hold "Storage Blob Data Reader" on that container\n` +
        `  - or unset FGS_REFERENCE_ACCOUNT and set FGS_REFERENCE_DIR to a local copy\n` +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return downloaded;
}
