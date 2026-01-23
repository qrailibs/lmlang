# (`Struct`) Custom-defined types

Allow to define own object types in code and use them. Also allows to extend existing types.

## Syntax: basics

```rust
// Definition
struct Point {
    x: int,
    y: int,
}

// Usage
Point a = {
	x = 0,
	y = 0
}
```

## Syntax: extending

```rust
// Definition
struct Point {
    x: int,
    y: int,
}
struct Circle: Point {
    radius: int,
}

// Usage
Circle a = {
	x = 0,
	y = 0,
	radius = 1
}
```
