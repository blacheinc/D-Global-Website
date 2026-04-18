import { PackageForm } from '@/features/admin/components/PackageForm';

export default function AdminPackageNewPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New package</h1>
        <p className="mt-2 text-sm text-muted">Only one package per tier. Inactive packages hide from /bookings.</p>
      </header>
      <PackageForm />
    </div>
  );
}
