# (`foreach`) Foreach loop

Allow to use inline foreach loop with keys/indexes and values.

## Syntax: basics

Foreach loop to walk all elements of array:

```java
arr<int> numbers = [1, 2, 3, 4, 5]

int sum = 0
for (number in numbers) {
    sum += number
}

// sum = 15
```

## Syntax: with keys

Foreach loop to walk all elements of array:

```java
rec<int, int> numbers = {
	1 = 100,
	2 = 200,
	3 = 300,
	4 = 400,
	5 = 500
}

int sum = 0
for (key,number in numbers) {
    sum += key + number
}

// sum = 1515
```
