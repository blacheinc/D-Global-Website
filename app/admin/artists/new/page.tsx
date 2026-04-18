import { ArtistForm } from '@/features/admin/components/ArtistForm';

export default function AdminArtistNewPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">New artist</h1>
        <p className="mt-2 text-sm text-muted">Artist profiles appear at /artists/[slug] when saved.</p>
      </header>
      <ArtistForm />
    </div>
  );
}
