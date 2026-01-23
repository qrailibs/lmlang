# (`array/record/tuple`) More object types

Allow to use more types that also accepts generic type.

## Syntax: array

```java
array<int> numbers = [1, 2, 3, 4, 5]
```

## Syntax: record

```java
record<int, int> numbers = {
	1 = 100,
	2 = 200,
	3 = 300,
	4 = 400,
	5 = 500
}
```

## Syntax: tuple

```java
tuple<int, int> numbers = {
	[1, 100],
	[2, 200],
	[3, 300],
	[4, 400],
	[5, 500]
}
```

## Syntax: converting

```java
// tuple can be converted to array/record
tuple<int, int> numbers = {
	[1, 100],
	[2, 200],
	[3, 300],
	[4, 400],
	[5, 500]
}

array<int> numbers_arr = numbers~array<int>
record<int, int> numbers_rec = numbers~record<int, int>

// ALSO:
// 1. array can be converted to record (index as keys), tuple (index as first value, value as second value)
// 2. record can be converted to array (keys as index, values as values), tuple (keys as first value, values as second value)
```
