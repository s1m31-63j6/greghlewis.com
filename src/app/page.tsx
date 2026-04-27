export default function Home() {
  return (
    <main className="flex-1 flex items-center justify-center px-6">
      <div className="max-w-xl">
        <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight">
          Greg Lewis
        </h1>
        <p className="mt-4 text-lg text-neutral-600 dark:text-neutral-400">
          AI systems, applied.
        </p>
        <p className="mt-10 text-sm text-neutral-500">
          Portfolio in progress —{" "}
          <a
            href="mailto:greghlewis@gmail.com"
            className="underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            get in touch
          </a>
          .
        </p>
      </div>
    </main>
  );
}
