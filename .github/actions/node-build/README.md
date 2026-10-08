# Node Build

Builds a locked Node/TypeScript package for the
`node-typescript-azure` archetype.

The action:

1. requires `package.json` and either `package-lock.json` or
   `npm-shrinkwrap.json`;
2. pins npm 11.19.0 on the Node 22 runtime, then installs with `npm ci`;
3. runs the declared lint, build, and test scripts as individual npm argv
   values;
4. requires a readable JUnit report with at least one executed test and no
   failures or errors;
5. requires a non-empty LCOV file;
6. uploads both evidence files.

No input is evaluated as a shell command. Script inputs are npm script names,
and all paths must remain within the repository.
