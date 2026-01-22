import { BashContainer } from "../src/orchestrator/container/BashContainer";

describe("BashContainer", () => {
    let container: BashContainer;

    beforeAll(async () => {
        container = new BashContainer();
        await container.init();
    });

    test("execute (async) should return stdout", async () => {
        const result = await container.execute("echo 'Hello Jest'", {});
        expect(result).toBe("Hello Jest");
    });

    test("execute (async) should pass context", async () => {
        const result = await container.execute("echo $GREETING", {
            GREETING: "Hello Context",
        });
        expect(result).toBe("Hello Context");
    });

    test("executeSync should return stdout", () => {
        const result = container.executeSync!("echo 'Hello Sync'", {});
        expect(result).toBe("Hello Sync");
    });

    test("executeSync should pass context", () => {
        const result = container.executeSync!("echo $VALUE", { VALUE: "123" });
        expect(result).toBe("123");
    });

    test("complex context should be jsonified", async () => {
        const result = await container.execute("echo $DATA", {
            DATA: { foo: "bar" },
        });
        expect(JSON.parse(result as string)).toEqual({ foo: "bar" });
    });

    test("multiline code should work", async () => {
        const code = `
        echo "Line 1"
        echo "Line 2"
        `;
        const result = await container.execute(code, {});
        // Bash might output newlines.
        expect((result as string).includes("Line 1")).toBe(true);
        expect((result as string).includes("Line 2")).toBe(true);
    });

    test("multiline code sync should work", () => {
        const code = `
        echo "Line 1"
        echo "Line 2"
        `;
        const result = container.executeSync!(code, {}) as string;
        expect(result.includes("Line 1")).toBe(true);
        expect(result.includes("Line 2")).toBe(true);
    });
});
