import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <section className="min-h-[70vh] grid place-items-center container-px">
      <div className="text-center max-w-md">
        <p className="eyebrow justify-center mb-6">404</p>
        <h1 className="font-display text-display-xl text-balance">Lost in the dark.</h1>
        <p className="mt-4 text-muted">
          The page you're looking for couldn't be found. Try one of these instead.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Button asChild variant="primary">
            <Link href="/">Back to home</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/events">Browse events</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
