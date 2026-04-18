import { notFound } from 'next/navigation';
import { db } from '@/server/db';
import { PackageForm } from '@/features/admin/components/PackageForm';

export const dynamic = 'force-dynamic';

export default async function AdminPackageEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pkg = await db.package.findUnique({ where: { id } });
  if (!pkg) notFound();
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Edit package</h1>
        <p className="mt-2 text-sm text-muted">{pkg.name}</p>
      </header>
      <PackageForm initial={pkg} />
    </div>
  );
}
