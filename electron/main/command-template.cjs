// @ts-check

/**
 * Honors quoted arguments only; no shell escaping semantics.
 * @param {string} command
 * @returns {Array<string>}
 */
const parseCommandTemplate = (command) =>
  command.match(/"[^"]+"|'[^']+'|\S+/g)?.map((part) => part.replace(/^['"]|['"]$/g, '')) ?? [];

/**
 * @param {string} arg
 * @param {Readonly<Record<string, string | undefined>>} values
 * @returns {string}
 */
const expandCommandPlaceholders = (arg, values) =>
  Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, value ?? ''),
    arg,
  );

module.exports = { expandCommandPlaceholders, parseCommandTemplate };
