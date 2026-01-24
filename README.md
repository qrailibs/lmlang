# lmlang

MVP of scripting language that allows to call different runtimes and pass their data between them.

```lmlang
import {write} from "lmlang/io";

// 1. Call bash runtime and pass into it $bash_var
str bash_msg = <bash bash_var={"bash"}>
	echo "Hello from ${bash_var}"
</bash>

// 2. Call python runtime and pass into it py_var
str py_msg = <python py_var={bash_msg}>
	return f"{py_var} and Python!"
</python>

write(bash_msg) // "Hello from bash"
write(py_msg) // "Hello from bash and Python!"
```

## Links

- [Featured proposals](./proposals/featured/README.md)
