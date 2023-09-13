// NOTE: Refered and modified from https://github.com/rexdavinci/browser-solidity-compiler/blob/main/src/index.ts
declare global {
  interface Worker {
    Module: any;
  }
}

type MessageData =
  | 'fetch-compiler-versions'
  | {
      input: string;
      version: string;
    };

export function browserSolidityCompiler() {
  const context: Worker = self as any;

  context.addEventListener('message', ({ data }: { data: MessageData }) => {
    if (data === 'fetch-compiler-versions') {
      fetch('https://binaries.soliditylang.org/bin/list.json')
        .then((response) => response.json())
        .then((result) => {
          postMessage(result);
        });
    } else {
      importScripts(data.version);
      const soljson = context.Module;

      if ('_solidity_compile' in soljson) {
        const compile = soljson.cwrap('solidity_compile', 'string', [
          'string',
          'number',
        ]);
        const output = JSON.parse(compile(data.input));
        postMessage(output);
      }
    }
  });
}
