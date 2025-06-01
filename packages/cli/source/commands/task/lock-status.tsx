import { DatabaseLock } from "@astrolabe/core";
import { Box, Text } from "ink";
import { useEffect, useState } from "react";
import zod from "zod";
import { useDatabase } from "../../context/DatabaseContext.js";

export const description = "Check database lock status and manage locks";

export const options = zod.object({
  verbose: zod.boolean().optional().describe('Show detailed lock information'),
  force: zod.boolean().optional().describe('Force remove any existing lock (use with caution)'),
});

type Props = {
  options: zod.infer<typeof options>;
};

interface LockInfo {
  pid: number;
  timestamp: number;
  host: string;
  process: string;
}

interface LockStatus {
  locked: boolean;
  info?: LockInfo;
  lockPath: string;
  age?: string;
}

export default function LockStatus({ options }: Props) {
  const db = useDatabase();
  const [status, setStatus] = useState<LockStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [forceUnlocked, setForceUnlocked] = useState(false);

  useEffect(() => {
    const checkLockStatus = async () => {
      try {
        // Get database path from the store
        const dbPath = (db as any).pgLite?.dataDir || './data/astrolabe.db';
        const lock = new DatabaseLock(dbPath, {
          processType: 'cli-lock-status'
        });

        if (options.force) {
          await lock.forceUnlock();
          setForceUnlocked(true);
        }

        const lockStatus = await lock.isLocked();
        const lockPath = lock.getLockPath();

        let age: string | undefined;
        if (lockStatus.locked && lockStatus.info?.timestamp) {
          const ageMs = Date.now() - lockStatus.info.timestamp;
          if (ageMs < 1000) {
            age = `${ageMs}ms`;
          } else if (ageMs < 60000) {
            age = `${Math.round(ageMs / 1000)}s`;
          } else {
            age = `${Math.round(ageMs / 60000)}m`;
          }
        }

        setStatus({
          locked: lockStatus.locked,
          info: lockStatus.info,
          lockPath,
          age
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    checkLockStatus();
  }, [options.force, db]);

  if (loading) {
    return <Text color="yellow">Checking database lock status...</Text>;
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">❌ Error checking lock status:</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  if (!status) {
    return <Text color="red">❌ Unable to determine lock status</Text>;
  }

  if (forceUnlocked) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⚠️  Database lock forcibly removed</Text>
        <Text color="gray">Lock file: {status.lockPath}</Text>
      </Box>
    );
  }

  if (!status.locked) {
    return (
      <Box flexDirection="column">
        <Text color="green">✅ Database is not locked</Text>
        {options.verbose && (
          <Text color="gray">Lock file: {status.lockPath}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="red">🔒 Database is locked</Text>
      
      {status.info && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="white">Lock Details:</Text>
          <Text color="gray">  Process: {status.info.process}</Text>
          <Text color="gray">  PID: {status.info.pid}</Text>
          <Text color="gray">  Host: {status.info.host}</Text>
          {status.age && <Text color="gray">  Age: {status.age}</Text>}
          
          {options.verbose && (
            <>
              <Text color="gray">  Timestamp: {new Date(status.info.timestamp).toISOString()}</Text>
              <Text color="gray">  Lock file: {status.lockPath}</Text>
            </>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="yellow">
          💡 To remove a stale lock, use: task-master task lock-status --force
        </Text>
      </Box>
    </Box>
  );
} 