const UNSAFE_XML_DECLARATION = /<!\s*(?:DOCTYPE|ENTITY)\b/i;

/**
 * Fiscal XML is inspected without resolving entities. Rejecting DTD/entity
 * declarations also prevents unsafe bytes from reaching storage or consumers.
 */
export function containsUnsafeXmlDeclaration(xml: string): boolean {
  return UNSAFE_XML_DECLARATION.test(xml);
}
