#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { initCommand } from "./commands/init";
import { runCommand } from "./commands/run";

yargs(hideBin(process.argv))
    .scriptName("lmlang")
    .usage("$0 <cmd> [args]")
    .command(initCommand)
    .command(runCommand)
    .help()
    .parse();
