# (`try`) Try statement

Allow to do try-catch as inline expression and as statement.

## Syntax: statement

```java
try {
	100 / 0
} catch (e) {
	write(e)
}
```

## Syntax: expression

```java
maybe[int] result = try { 100 / 0 }

write(result) // {"result": nil, "err": err("You cannot divide by 0")}
```
