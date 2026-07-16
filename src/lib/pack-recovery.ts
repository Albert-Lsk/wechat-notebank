import * as path from 'path';
import { CommandError, getErrorMessage } from './command-error';
import { recoverInterruptedFileTransactions } from './file-transaction';

export async function recoverPackTransactions(vaultRoot: string): Promise<void> {
  try {
    await recoverInterruptedFileTransactions(path.resolve(vaultRoot));
  } catch (error) {
    throw new CommandError(
      'TRANSACTION_FAILED',
      `无法恢复上次中断的加工事务: ${getErrorMessage(error)}`
    );
  }
}

export async function recoverPackTransactionsForFile(packFile: string): Promise<void> {
  const inbox = path.dirname(path.resolve(packFile));
  if (path.basename(inbox) !== 'Inbox') {
    return;
  }
  await recoverPackTransactions(path.dirname(inbox));
}
