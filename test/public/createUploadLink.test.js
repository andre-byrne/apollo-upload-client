'use strict';

const { deepStrictEqual, rejects, strictEqual } = require('assert');
const {
  ApolloClient,
  ApolloError,
  ApolloLink,
  concat,
  gql,
  InMemoryCache,
} = require('@apollo/client/core');
const { AbortController, AbortSignal } = require('abort-controller');
const Blob = require('fetch-blob');
const FormData = require('formdata-node');
const { AbortError, Response } = require('node-fetch');
const createUploadLink = require('../../public/createUploadLink');
const revertablePolyfills = require('../revertablePolyfills');

const standardAbortErrorMessage = 'The operation was aborted.';
const defaultUri = '/graphql';
const graphqlResponseHeaders = {
  'Content-Type': 'application/graphql+json',
};
const graphqlResponseOptionsOk = {
  status: 200,
  headers: graphqlResponseHeaders,
};

module.exports = (tests) => {
  tests.add(
    '`createUploadLink` with default options, a query, no files, no GraphQL errors.',
    async () => {
      let fetchUri;
      let fetchOptions;

      const revertPolyfills = revertablePolyfills({
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;

          return new Response(
            JSON.stringify({ data: { a: true } }),
            graphqlResponseOptionsOk
          );
        },
      });

      try {
        const apolloClient = new ApolloClient({
          cache: new InMemoryCache(),
          link: createUploadLink(),
        });
        const query = '{\n  a\n}\n';
        const result = await apolloClient.query({
          query: gql(query),
        });

        deepStrictEqual(result, {
          data: { a: true },
          loading: false,
          networkStatus: 7,
        });
        strictEqual(fetchUri, defaultUri);
        strictEqual(fetchOptions.method, 'POST');
        deepStrictEqual(JSON.parse(fetchOptions.body), {
          query,
          variables: {},
        });
      } finally {
        revertPolyfills();
      }
    }
  );

  tests.add(
    '`createUploadLink` with default options, a mutation, files.',
    async () => {
      let fetchUri;
      let fetchOptions;

      const revertPolyfills = revertablePolyfills({
        Blob,
        FormData,
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;

          return new Response(
            JSON.stringify({ data: { a: true } }),
            graphqlResponseOptionsOk
          );
        },
      });

      try {
        const apolloClient = new ApolloClient({
          cache: new InMemoryCache(),
          link: createUploadLink(),
        });
        const query = 'mutation ($a: Upload!) {\n  a(a: $a)\n}\n';
        const filetype = 'text/plain';
        const result = await apolloClient.mutate({
          mutation: gql(query),
          variables: {
            a: new Blob(['a'], { type: filetype }),
          },
        });

        deepStrictEqual(result, { data: { a: true } });
        strictEqual(fetchUri, defaultUri);
        strictEqual(fetchOptions.method, 'POST');
        strictEqual(fetchOptions.body instanceof FormData, true);

        const formDataEntries = Array.from(fetchOptions.body.entries());

        strictEqual(formDataEntries.length, 3);
        strictEqual(formDataEntries[0][0], 'operations');
        deepStrictEqual(JSON.parse(formDataEntries[0][1]), {
          query,
          variables: { a: null },
        });
        strictEqual(formDataEntries[1][0], 'map');
        deepStrictEqual(JSON.parse(formDataEntries[1][1]), {
          '1': ['variables.a'],
        });
        strictEqual(formDataEntries[2][0], '1');
        // A FormData field value can be either a string or a File instance.
        // Due to a bug an `instanceof Blob` check won’t work here, see:
        // https://github.com/octet-stream/form-data/issues/14
        strictEqual(typeof formDataEntries[2][1], 'object');
        strictEqual(formDataEntries[2][1].name, 'blob');
        strictEqual(formDataEntries[2][1].type, filetype);
      } finally {
        revertPolyfills();
      }
    }
  );

  tests.add('`createUploadLink` with option `uri`.', async () => {
    let fetchUri;
    let fetchOptions;

    const uri = 'http://localhost:3000';
    const apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: createUploadLink({
        uri,
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;

          return new Response(
            JSON.stringify({ data: { a: true } }),
            graphqlResponseOptionsOk
          );
        },
      }),
    });
    const query = '{\n  a\n}\n';
    const result = await apolloClient.query({
      query: gql(query),
    });

    deepStrictEqual(result, {
      data: { a: true },
      loading: false,
      networkStatus: 7,
    });
    strictEqual(fetchUri, uri);
    strictEqual(fetchOptions.method, 'POST');
    deepStrictEqual(JSON.parse(fetchOptions.body), {
      query,
      variables: {},
    });
  });

  tests.add('`createUploadLink` with option `includeExtensions`.', async () => {
    let fetchUri;
    let fetchOptions;

    const apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: concat(
        new ApolloLink((operation, forward) => {
          operation.extensions.a = true;
          return forward(operation);
        }),
        createUploadLink({
          includeExtensions: true,
          async fetch(uri, options) {
            fetchUri = uri;
            fetchOptions = options;

            return new Response(
              JSON.stringify({ data: { a: true } }),
              graphqlResponseOptionsOk
            );
          },
        })
      ),
    });
    const query = '{\n  a\n}\n';
    const result = await apolloClient.query({
      query: gql(query),
    });

    deepStrictEqual(result, {
      data: { a: true },
      loading: false,
      networkStatus: 7,
    });
    strictEqual(fetchUri, defaultUri);
    strictEqual(fetchOptions.method, 'POST');
    deepStrictEqual(JSON.parse(fetchOptions.body), {
      query,
      variables: {},
      extensions: {
        a: true,
      },
    });
  });

  tests.add('`createUploadLink` with client awareness.', async () => {
    let fetchUri;
    let fetchOptions;

    const clientAwareness = {
      name: 'a',
      version: '1.0.0',
    };
    const apolloClient = new ApolloClient({
      // Apollo Client automatically sets `clientAwareness` in the Apollo Link
      // context from the `name` and `version` constructor options.
      ...clientAwareness,
      cache: new InMemoryCache(),
      link: createUploadLink({
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;

          return new Response(
            JSON.stringify({ data: { a: true } }),
            graphqlResponseOptionsOk
          );
        },
      }),
    });
    const query = '{\n  a\n}\n';
    const result = await apolloClient.query({
      query: gql(query),
    });

    deepStrictEqual(result, {
      data: { a: true },
      loading: false,
      networkStatus: 7,
    });
    strictEqual(fetchUri, defaultUri);
    strictEqual(fetchOptions.method, 'POST');
    strictEqual(
      fetchOptions.headers['apollographql-client-name'],
      clientAwareness.name
    );
    strictEqual(
      fetchOptions.headers['apollographql-client-version'],
      clientAwareness.version
    );
    deepStrictEqual(JSON.parse(fetchOptions.body), {
      query,
      variables: {},
    });
  });

  tests.add(
    '`createUploadLink` with client awareness, overridden by context `headers`.',
    async () => {
      let fetchUri;
      let fetchOptions;

      const clientAwareness = {
        name: 'b',
        version: '2.0.0',
      };
      const apolloClient = new ApolloClient({
        cache: new InMemoryCache(),
        link: concat(
          new ApolloLink((operation, forward) => {
            operation.setContext({
              clientAwareness: {
                name: 'a',
                version: '1.0.0',
              },
              headers: {
                'apollographql-client-name': clientAwareness.name,
                'apollographql-client-version': clientAwareness.version,
              },
            });
            return forward(operation);
          }),
          createUploadLink({
            async fetch(uri, options) {
              fetchUri = uri;
              fetchOptions = options;

              return new Response(
                JSON.stringify({ data: { a: true } }),
                graphqlResponseOptionsOk
              );
            },
          })
        ),
      });
      const query = '{\n  a\n}\n';
      const result = await apolloClient.query({
        query: gql(query),
      });

      deepStrictEqual(result, {
        data: { a: true },
        loading: false,
        networkStatus: 7,
      });
      strictEqual(fetchUri, defaultUri);
      strictEqual(fetchOptions.method, 'POST');
      strictEqual(
        fetchOptions.headers['apollographql-client-name'],
        clientAwareness.name
      );
      strictEqual(
        fetchOptions.headers['apollographql-client-version'],
        clientAwareness.version
      );
      deepStrictEqual(JSON.parse(fetchOptions.body), {
        query,
        variables: {},
      });
    }
  );

  tests.add(
    '`createUploadLink` options `isExtractableFile`, `formDataAppendFile`.',
    async () => {
      let fetchUri;
      let fetchOptions;

      const filetype = 'text/plain';

      class TextFile {
        constructor(content) {
          this.blob = new Blob([content], { type: filetype });
        }
      }

      const apolloClient = new ApolloClient({
        cache: new InMemoryCache(),
        link: createUploadLink({
          isExtractableFile(value) {
            return value instanceof TextFile;
          },
          formDataAppendFile(formData, fieldName, file) {
            formData.append(
              fieldName,
              file instanceof TextFile ? file.blob : file
            );
          },
          FormData,
          async fetch(uri, options) {
            fetchUri = uri;
            fetchOptions = options;

            return new Response(
              JSON.stringify({ data: { a: true } }),
              graphqlResponseOptionsOk
            );
          },
        }),
      });
      const query = 'mutation ($a: Upload!) {\n  a(a: $a)\n}\n';
      const result = await apolloClient.mutate({
        mutation: gql(query),
        variables: {
          a: new TextFile('a'),
        },
      });

      deepStrictEqual(result, { data: { a: true } });
      strictEqual(fetchUri, defaultUri);
      strictEqual(fetchOptions.method, 'POST');
      strictEqual(fetchOptions.body instanceof FormData, true);

      const formDataEntries = Array.from(fetchOptions.body.entries());

      strictEqual(formDataEntries.length, 3);
      strictEqual(formDataEntries[0][0], 'operations');
      deepStrictEqual(JSON.parse(formDataEntries[0][1]), {
        query,
        variables: { a: null },
      });
      strictEqual(formDataEntries[1][0], 'map');
      deepStrictEqual(JSON.parse(formDataEntries[1][1]), {
        '1': ['variables.a'],
      });
      strictEqual(formDataEntries[2][0], '1');
      // A FormData field value can be either a string or a File instance.
      // Due to a bug an `instanceof Blob` check won’t work here, see:
      // https://github.com/octet-stream/form-data/issues/14
      strictEqual(typeof formDataEntries[2][1], 'object');
      strictEqual(formDataEntries[2][1].name, 'blob');
      strictEqual(formDataEntries[2][1].type, filetype);
    }
  );

  tests.add('`createUploadLink` with errors, data.', async () => {
    let fetchUri;
    let fetchOptions;

    const graphQLErrors = [
      {
        message: 'Cannot query field "b" on type "Query".',
        locations: [{ line: 3, column: 3 }],
      },
    ];
    const apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: createUploadLink({
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;

          return new Response(
            JSON.stringify({ errors: graphQLErrors, data: { a: true } }),
            {
              status: 400,
              headers: graphqlResponseHeaders,
            }
          );
        },
      }),
    });
    const query = '{\n  a\n  b\n}\n';

    await rejects(
      apolloClient.query({
        query: gql(query),
      }),
      new ApolloError({ graphQLErrors })
    );

    strictEqual(fetchUri, defaultUri);
    strictEqual(fetchOptions.method, 'POST');
    deepStrictEqual(JSON.parse(fetchOptions.body), {
      query,
      variables: {},
    });
  });

  tests.add('`createUploadLink` with errors, no data.', async () => {
    let fetchUri;
    let fetchOptions;
    let fetchResponse;

    const payload = { errors: [{ message: 'Unauthorized.' }] };
    const apolloClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: createUploadLink({
        async fetch(uri, options) {
          fetchUri = uri;
          fetchOptions = options;
          fetchResponse = new Response(JSON.stringify(payload), {
            status: 401,
            headers: graphqlResponseHeaders,
          });

          return fetchResponse;
        },
      }),
    });
    const query = '{\n  a\n}\n';

    await rejects(
      apolloClient.query({
        query: gql(query),
      }),
      (error) => {
        try {
          strictEqual(error instanceof ApolloError, true);
          strictEqual('networkError' in error, true);
          strictEqual(error.networkError.name, 'ServerError');
          strictEqual(error.networkError.statusCode, 401);
          strictEqual(error.networkError.response, fetchResponse);
          deepStrictEqual(error.networkError.result, payload);
          return true;
        } catch (error) {
          return false;
        }
      }
    );

    strictEqual(fetchUri, defaultUri);
    strictEqual(fetchOptions.method, 'POST');
    deepStrictEqual(JSON.parse(fetchOptions.body), {
      query,
      variables: {},
    });
  });

  tests.add(
    '`createUploadLink` with an abort signal, via fetch options.',
    async () => {
      let fetchUri;
      let fetchOptions;

      const controller = new AbortController();
      const revertPolyfills = revertablePolyfills({
        AbortController,
        AbortSignal,
      });

      try {
        const apolloClient = new ApolloClient({
          cache: new InMemoryCache(),
          link: createUploadLink({
            fetchOptions: {
              signal: controller.signal,
            },
            fetch(uri, options) {
              fetchUri = uri;
              fetchOptions = options;

              return new Promise((resolve, reject) => {
                // Sleep a few seconds to simulate a slow request and response.
                // In this test the fetch should be aborted before the timeout.
                const timeout = setTimeout(() => {
                  resolve(
                    new Response(
                      JSON.stringify({ data: { a: true } }),
                      graphqlResponseOptionsOk
                    )
                  );
                }, 4000);

                options.signal.addEventListener('abort', () => {
                  clearTimeout(timeout);
                  reject(new AbortError(standardAbortErrorMessage));
                });
              });
            },
          }),
        });
        const query = '{\n  a\n}\n';
        const resultPromise = apolloClient.query({
          query: gql(query),
        });

        controller.abort();

        await rejects(
          resultPromise,
          new ApolloError({
            networkError: new AbortError(standardAbortErrorMessage),
          })
        );

        strictEqual(fetchUri, defaultUri);
        strictEqual(fetchOptions.method, 'POST');
        deepStrictEqual(JSON.parse(fetchOptions.body), {
          query,
          variables: {},
        });
      } finally {
        revertPolyfills();
      }
    }
  );
};
