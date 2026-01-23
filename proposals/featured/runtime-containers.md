# (`Container`) Runtime containers spawning

Allow to spawn a new containers in runtime and control them, without predefining in the `config.yml`.

## Syntax: basics

```rust
import {Container, spawn} from "lmlang/containers"

Container bash = spawn({
	runtime = "bash"
})

str result = <bash>
	echo "hi"
</bash> ~ str // "hi"
```
