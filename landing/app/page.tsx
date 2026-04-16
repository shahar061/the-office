import Nav from "../components/Nav";

export default function Home() {
  return (
    <main>
      <Nav />
      <div className="flex min-h-screen items-center justify-center">
        <h1 className="font-pixel text-2xl text-text-primary">pixel.team</h1>
      </div>
    </main>
  );
}
