import BrandMark from '@/components/BrandMark';

export default function AuthLoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 min-h-screen">
      <BrandMark size="md" />
      <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );
}
