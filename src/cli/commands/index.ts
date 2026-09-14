// slitex — the root command. `slitex <file>` serves the viewer locally with
// the database already open; there are no subcommands. oclif runs the root
// command when no subcommand matches, so bare `slitex file.db` works.
import { Args, Command, Flags } from "@oclif/core";
import { basename, resolve } from "node:path";
import { looksLikeSqliteFile, startServer } from "../server.js";

export default class Slitex extends Command {
  static description =
    "Open a SQLite database in the slitex viewer — served locally, nothing leaves your machine.";

  static args = {
    file: Args.file({
      description: "Path to a SQLite database file (.sqlite, .db, .sqlite3)",
      required: true,
      exists: true,
    }),
  };

  static flags = {
    port: Flags.integer({
      char: "p",
      description: "Port to serve the viewer on",
      default: 3000,
    }),
    open: Flags.boolean({
      description: "Open the browser automatically",
      default: true,
      allowNo: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Slitex);
    const file = resolve(args.file);

    if (!looksLikeSqliteFile(file)) {
      this.error(`"${args.file}" is not a valid SQLite database file.`, { exit: 1 });
    }

    try {
      const url = await startServer({ file, port: flags.port, open: flags.open });
      this.log("");
      this.log(`  🗄️  slitex — ${basename(file)}`);
      this.log(`  →  ${url}`);
      this.log("");
      this.log("  Press Ctrl+C to stop.");
    } catch (err) {
      this.error(err instanceof Error ? err.message : String(err), { exit: 1 });
    }
  }
}
