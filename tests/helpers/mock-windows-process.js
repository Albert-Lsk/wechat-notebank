// Simulate Windows process inspection when the test runs on another OS.
const childProcess = require('child_process');
const { promisify } = require('util');

Object.defineProperty(process, 'platform', { value: 'win32' });

const originalExecFile = childProcess.execFile;
childProcess.execFile = function (file, args, options, callback) {
  if (file === '/bin/ps') {
    const error = Object.assign(new Error('spawn /bin/ps ENOENT'), { code: 'ENOENT' });
    return process.nextTick(() => callback(error, '', ''));
  }
  if (!/(?:^|[\\/])powershell\.exe$/i.test(file)) {
    return originalExecFile.apply(this, arguments);
  }

  const command = args[args.length - 1];
  const match = command.match(/GetProcessById\((\d+)\)/);
  if (!match) {
    throw new Error('Expected a process ID in the PowerShell command');
  }
  const pid = Number(match[1]);
  if (pid === 2147483647 || pid === 2147483646) {
    const error = Object.assign(new Error('PowerShell process query failed'), {
      code: pid === 2147483647 ? 3 : 2,
    });
    return process.nextTick(() => callback(error, '', ''));
  }
  const identity = (638000000000000000n + BigInt(pid)).toString();
  return process.nextTick(() => callback(null, `${identity}\n`, ''));
};

childProcess.execFile[promisify.custom] = (file, args, options) => new Promise((resolve, reject) => {
  childProcess.execFile(file, args, options, (error, stdout, stderr) => {
    if (error) reject(error);
    else resolve({ stdout, stderr });
  });
});
