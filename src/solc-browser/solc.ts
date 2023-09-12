// NOTE: Refered and modified from https://github.com/rexdavinci/browser-solidity-compiler
import { browserSolidityCompiler } from './worker';

const worker = new Worker(
  URL.createObjectURL(
    new Blob([`(${browserSolidityCompiler})()`], { type: 'module' }),
  ),
);

/**
 *
 * @param input
 * @param version Version of the solidity compiler. Default to "https://binaries.soliditylang.org/bin/soljson-v0.8.21+commit.d9974bed.js"
 * @returns
 */
export async function compile(
  input: string,
  version: string = 'https://binaries.soliditylang.org/bin/soljson-v0.8.21+commit.d9974bed.js',
): Promise<string> {
  return new Promise((resolve, reject) => {
    worker.postMessage({ input, version });
    worker.onmessage = function ({ data }) {
      resolve(JSON.stringify(data));
    };
    worker.onerror = reject;
  });
}

export async function versions(): Promise<{
  latestRelease: string;
  releases: { [key: string]: string };
  builds: {
    path: string;
    version: string;
    build: string;
    longVersion: string;
    keccak256: string;
    sha256: string;
    urls: { bzzr: string; dweb: string }[];
  };
}> {
  return new Promise((resolve, reject) => {
    worker.postMessage('fetch-compiler-versions');
    worker.onmessage = function ({ data }) {
      resolve(data);
    };
    worker.onerror = reject;
  });
}
