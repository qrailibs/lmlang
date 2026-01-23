# (`switch`) Switch expression

Allow to use inline switch expressions.

## Syntax: basics

Switching between literal string values:

```java
unknown input = "apple"

str result = switch(type input) {
    case "str" => "its text";
    case "int", "dbl" => "its number";
    default => "smth else";
} // its text
```
