import { PrismaClient } from '@prisma/client';
import {
  auditCedisInventoryData,
  formatCedisInventoryPreflightReport,
  loadCedisInventoryPreflightData,
} from '../../src/modules/inventory/cedis-inventory-preflight';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for the CEDIS inventory preflight');
  }

  const prisma = new PrismaClient();
  const jsonOutput = process.argv.includes('--json');

  try {
    const data = await loadCedisInventoryPreflightData(prisma);
    const report = auditCedisInventoryData(data);
    const output = jsonOutput
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatCedisInventoryPreflightReport(report);

    process.stdout.write(output);
    if (report.status === 'FAIL') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 2;
  });
}
