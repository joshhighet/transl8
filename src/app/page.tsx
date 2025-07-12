import { Suspense } from 'react';
import QueryBuilder from '@/components/QueryBuilder';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-center">transl8: query builder</h1>
      </header>
      <main className="max-w-7xl mx-auto">
        <Suspense fallback={<div>loading...</div>}>
          <QueryBuilder />
        </Suspense>
      </main>
    </div>
  );
}