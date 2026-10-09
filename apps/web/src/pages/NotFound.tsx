import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-4xl font-bold text-[var(--main)]">404</p>
      <p className="text-sm text-[var(--sub)]">This page doesn’t exist in TypeLens.</p>
      <Link to="/">
        <Button variant="primary" size="md">
          Back to overview
        </Button>
      </Link>
    </div>
  );
}
