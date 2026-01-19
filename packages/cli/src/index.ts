#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { interpret } from "@lmlang/core";

yargs(hideBin(process.argv))
    .scriptName("lmlang")
    .usage("$0 <cmd> [args]")
    .command(
        "run [code]",
        "Run lmlang code",
        (yargs) => {
            return yargs.positional("code", {
                describe: "Code to run",
                type: "string",
                default: 'print("Hello")',
            });
        },
        (argv) => {
            console.log(chalk.green("Running lmlang..."));
            console.log(interpret(argv.code));
        },
    )
    .help()
    .parse();
