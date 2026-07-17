import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // A handful of .js files under src/ contain JSX (src/index.js, and a
  // few *.test.js files using React Testing Library's render(<X/>)) --
  // CRA/babel transformed JSX in .js files transparently, but Vite's
  // esbuild-based transform only applies the JSX loader to .jsx/.tsx by
  // default. Rather than renaming those files (unnecessary risk to
  // import paths elsewhere), tell esbuild to treat every .js file under
  // src/ as JSX -- safe to apply broadly since plain JS with no JSX in
  // it parses identically either way.
  esbuild: {
    loader: "jsx",
    include: /src\/.*\.jsx?$/,
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { ".js": "jsx" },
    },
  },
  // CRA served everything from '/', and the app is deployed at the
  // domain root on Vercel (not a subpath) -- keep that behavior.
  base: "/",
  build: {
    // Matches CRA's default output directory. Vercel's project is
    // currently locked to the create-react-app framework preset (output
    // dir 'build/'); keeping this the same avoids needing to change the
    // output directory setting at the same time as the framework preset
    // -- one less thing to get wrong in the same step. Can be revisited
    // to Vite's 'dist' default later if desired, once the framework
    // preset itself is confirmed switched over.
    outDir: "build",
  },
  test: {
    // globals: true matches Jest's implicit describe/test/expect/
    // beforeEach globals -- every existing test file relies on these
    // being available without an import, and preserving that avoids
    // touching all 19 test files just to add import lines.
    globals: true,
    environment: "jsdom",
    css: false,
  },
});
