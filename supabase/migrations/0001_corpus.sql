-- Research corpus for MeaningEngine. Apply once in the Supabase SQL editor (or `supabase db push`).
create extension if not exists vector;

create table if not exists corpus_chunks (
  id text primary key,                 -- "<source path>#<n>"
  source_id text not null,             -- path under corpus/, e.g. "iog/report.pdf"
  title text not null,
  publisher text not null,
  url text,
  page int,
  content text not null,
  embedding vector(1536) not null,     -- must match embeddings.dimensions in config/engine.yaml
  updated_at timestamptz not null default now()
);

create index if not exists corpus_chunks_embedding_idx
  on corpus_chunks using hnsw (embedding vector_cosine_ops);

-- Only the server (service role key) reads or writes this table.
alter table corpus_chunks enable row level security;

create or replace function match_corpus_chunks(query_embedding vector(1536), match_count int)
returns table (
  id text, source_id text, title text, publisher text,
  url text, page int, content text, similarity float
)
language sql stable
as $$
  select id, source_id, title, publisher, url, page, content,
         1 - (embedding <=> query_embedding) as similarity
  from corpus_chunks
  order by embedding <=> query_embedding
  limit match_count;
$$;
